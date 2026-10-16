import { Types } from 'mongoose';
import { ReviewInfoRequestService } from '../services/review-info-request.service';
import { InfoRequestStatus } from '../schemas/review-info-request.schema';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ForbiddenDomainException,
  ResourceNotFoundException,
  ValidationDomainException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

const ORG = 'org-1';
const APPLICANT = 'applicant-1';
const Q1 = new Types.ObjectId();
const Q2 = new Types.ObjectId();

type Doc = ReturnType<typeof makeDoc>;

function makeDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, any> = {
    _id: new Types.ObjectId(),
    organizationId: ORG,
    applicationId: new Types.ObjectId(),
    programId: new Types.ObjectId(),
    reviewerId: 'reviewer-1',
    applicantId: APPLICANT,
    status: InfoRequestStatus.OPEN,
    questions: [
      { _id: Q1, questionKey: 'transcript', text: 'Transcript?', required: true, hint: 'PDF' },
      { _id: Q2, questionKey: 'essay', text: 'Essay?', required: false },
    ],
    deadline: new Date(Date.now() + 86_400_000),
    reviewerNote: 'Please clarify',
    responses: [] as any[],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    save: jest.fn(async function (this: Record<string, unknown>) {
      return this;
    }),
    ...overrides,
  };
  return doc;
}

function makeService(doc: Doc | null) {
  const infoRequestModel = {
    findById: jest.fn(() => ({ exec: async () => doc })),
  };
  const emailService = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new ReviewInfoRequestService(
    infoRequestModel as never,
    {} as never,
    emailService as never,
  );
  return { service, emailService, infoRequestModel };
}

const answerFor = (id: Types.ObjectId, value = 'My answer') => ({
  questionId: id.toString(),
  value,
});

describe('ReviewInfoRequestService.submitResponse', () => {
  it('appends a typed first response and moves the request to responded', async () => {
    const doc = makeDoc();
    const { service, emailService } = makeService(doc);

    const result = await service.submitResponse(ORG, doc._id.toString(), APPLICANT, {
      answers: [answerFor(Q1)],
      note: 'See attached',
    });

    expect(doc.responses).toHaveLength(1);
    expect(doc.responses[0].questionId).toBeUndefined();
    expect(doc.responses[0]._id).toBeInstanceOf(Types.ObjectId);
    expect(doc.responses[0].answers[0].questionId).toBeInstanceOf(Types.ObjectId);
    expect(doc.status).toBe(InfoRequestStatus.RESPONDED);
    expect(result.latestVersion).toBe(1);
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });

  it('numbers each later submission as the next version and keeps earlier ones', async () => {
    const doc = makeDoc();
    const { service } = makeService(doc);
    const id = doc._id.toString();

    await service.submitResponse(ORG, id, APPLICANT, { answers: [answerFor(Q1, 'first')] });
    const result = await service.submitResponse(ORG, id, APPLICANT, {
      answers: [answerFor(Q1, 'second')],
    });

    expect(result.latestVersion).toBe(2);
    expect(doc.responses.map((r: any) => r.version)).toEqual([1, 2]);
    expect(doc.responses[0].answers[0].value).toBe('first');
  });

  describe('a malformed response fails before the document is changed', () => {
    const cases: Array<[string, (doc: Doc) => any, ErrorCode | undefined]> = [
      ['an unknown questionId', () => ({ answers: [answerFor(new Types.ObjectId())] }), ErrorCode.VAL_INFO_REQUEST_UNKNOWN_QUESTION],
      ['a duplicate questionId', () => ({ answers: [answerFor(Q1), answerFor(Q1, 'again')] }), ErrorCode.VAL_INFO_REQUEST_UNKNOWN_QUESTION],
      ['a missing required answer', () => ({ answers: [answerFor(Q2)] }), ErrorCode.VAL_INFO_REQUEST_REQUIRED_ANSWER_MISSING],
      ['an empty answer', () => ({ answers: [answerFor(Q1, '   ')] }), ErrorCode.VAL_INVALID_INPUT],
      ['an over-long answer', () => ({ answers: [answerFor(Q1, 'x'.repeat(5001))] }), ErrorCode.VAL_INVALID_INPUT],
      ['an over-long note', () => ({ answers: [answerFor(Q1)], note: 'n'.repeat(2001) }), undefined],
    ];

    it.each(cases)('%s', async (_label, body, code) => {
      const doc = makeDoc();
      const { service, emailService } = makeService(doc);

      const attempt = service.submitResponse(ORG, doc._id.toString(), APPLICANT, body(doc));

      await expect(attempt).rejects.toBeInstanceOf(ValidationDomainException);
      if (code) await expect(attempt).rejects.toMatchObject({ errorCode: code });
      expect(doc.responses).toHaveLength(0);
      expect(doc.status).toBe(InfoRequestStatus.OPEN);
      expect(doc.save).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  it('rejects someone other than the applicant', async () => {
    const doc = makeDoc();
    const { service } = makeService(doc);

    await expect(
      service.submitResponse(ORG, doc._id.toString(), 'someone-else', { answers: [answerFor(Q1)] }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(doc.responses).toHaveLength(0);
  });

  it('treats a request from another organization as not found', async () => {
    const doc = makeDoc({ organizationId: 'org-2' });
    const { service } = makeService(doc);

    await expect(
      service.submitResponse(ORG, doc._id.toString(), APPLICANT, { answers: [answerFor(Q1)] }),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it.each([InfoRequestStatus.CANCELLED, InfoRequestStatus.EXPIRED])(
    'refuses a %s request',
    async (status) => {
      const doc = makeDoc({ status });
      const { service } = makeService(doc);

      await expect(
        service.submitResponse(ORG, doc._id.toString(), APPLICANT, { answers: [answerFor(Q1)] }),
      ).rejects.toBeInstanceOf(BusinessRuleException);
      expect(doc.responses).toHaveLength(0);
    },
  );
});

describe('info-request response serialization', () => {
  const serialized = async (responses: any[]) => {
    const doc = makeDoc({ responses });
    const { service } = makeService(doc);
    return service.getRequest(ORG, doc._id.toString());
  };

  const stored = (version: number, note?: string) => ({
    _id: new Types.ObjectId(),
    version,
    answers: [{ questionId: Q1, value: `answer ${version}` }],
    note,
    submittedBy: APPLICANT,
    submittedAt: new Date(`2026-02-0${version}T10:00:00Z`),
  });

  it('serializes a request with no responses', async () => {
    const result = await serialized([]);

    expect(result.responses).toEqual([]);
    expect(result.latestVersion).toBe(0);
  });

  it('serializes a response with a note', async () => {
    const result = await serialized([stored(1, 'a note')]);

    expect(result.responses[0]).toEqual({
      id: expect.any(String),
      version: 1,
      answers: [{ questionId: Q1.toString(), value: 'answer 1' }],
      note: 'a note',
      submittedBy: APPLICANT,
      submittedAt: '2026-02-01T10:00:00.000Z',
    });
  });

  it('serializes a response without a note', async () => {
    const result = await serialized([stored(1)]);

    expect(result.responses[0].note).toBeUndefined();
    expect(result.responses[0].answers).toHaveLength(1);
  });

  it('serializes several versions in order and reports the latest', async () => {
    const result = await serialized([stored(1), stored(2, 'revised'), stored(3)]);

    expect(result.responses.map((r) => r.version)).toEqual([1, 2, 3]);
    expect(result.latestVersion).toBe(3);
  });
});
