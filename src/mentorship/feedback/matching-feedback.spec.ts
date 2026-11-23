import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { FeedbackPolicy } from './feedback.policy';
import { MatchingFeedbackService } from './matching-feedback.service';
import { SubmitFeedbackDto } from './dto/matching-feedback.dto';
import {
  FeedbackKind,
  FeedbackRetentionPolicy,
  FeedbackSubjectType,
} from './schemas/matching-feedback.schema';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: SubmitFeedbackDto });

const AUTHOR = '507f1f77bcf86cd799439001';
const OTHER = '507f1f77bcf86cd799439002';
const ADMIN = '507f1f77bcf86cd799439003';
const COORDINATOR = '507f1f77bcf86cd799439004';

const user = (id: string, role = Role.STUDENT): MentorshipUser => ({
  id,
  email: `${id}@example.com`,
  role,
});

const payload = () => ({
  subjectId: 'recommendation-1',
  subjectType: FeedbackSubjectType.RECOMMENDATION,
  kind: FeedbackKind.RECOMMENDATION_RELEVANCE,
  rating: 4,
  freeText: 'Relevant mentor suggestion',
  consentGiven: true,
  retentionPolicy: FeedbackRetentionPolicy.ANONYMIZED_90D,
  idempotencyKey: 'feedback-key-1',
});

class FakeFeedbackModel {
  docs: any[] = [];
  aggregateRows: any[] = [];
  lastPipeline: any[] = [];
  private counter = 0;

  private matches(doc: any, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => doc[key] === value);
  }

  findOne(filter: Record<string, unknown>) {
    return { exec: async () => this.docs.find((d) => this.matches(d, filter)) ?? null };
  }

  findById(id: string) {
    return { exec: async () => this.docs.find((d) => d._id === id) ?? null };
  }

  find(filter: Record<string, unknown>) {
    return {
      sort: () => ({
        exec: async () => this.docs.filter((d) => this.matches(d, filter)),
      }),
    };
  }

  async create(data: any) {
    const doc = { _id: `feedback-${++this.counter}`, createdAt: new Date(), ...data };
    this.docs.push(doc);
    return doc;
  }

  aggregate(pipeline: any[]) {
    this.lastPipeline = pipeline;
    return { exec: async () => this.aggregateRows };
  }
}

describe('SubmitFeedbackDto', () => {
  it('accepts consented feedback', async () => {
    await expect(validate(payload())).resolves.toBeInstanceOf(SubmitFeedbackDto);
  });

  it.each([
    ['missing consent', { consentGiven: false }],
    ['an out-of-range rating', { rating: 6 }],
    ['an unknown retention policy', { retentionPolicy: 'forever' }],
    ['an unknown field', { agreementId: 'change-the-terms' }],
  ])('rejects %s', async (_label, patch) => {
    await expect(validate({ ...payload(), ...patch })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('MatchingFeedbackService', () => {
  let model: FakeFeedbackModel;
  let service: MatchingFeedbackService;
  let telemetry: { count: jest.Mock };

  beforeEach(() => {
    model = new FakeFeedbackModel();
    telemetry = { count: jest.fn() };
    service = new MatchingFeedbackService(
      model as any,
      new FeedbackPolicy(telemetry as any),
      telemetry as any,
    );
  });

  const submit = () => service.submit(user(AUTHOR), payload() as any);

  it('stores consented feedback once and never returns free text in receipts', async () => {
    const first = await submit();
    const replay = await submit();

    expect(first.id).toBe(replay.id);
    expect(model.docs).toHaveLength(1);
    expect(model.docs[0].consentGiven).toBe(true);
    expect(model.docs[0].retentionExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(first).not.toHaveProperty('freeText');
    expect(first).not.toHaveProperty('subjectId');
    expect(model.docs[0].freeText).toBe('Relevant mentor suggestion');
  });

  it('refuses feedback without explicit consent at the service layer', async () => {
    await expect(
      service.submit(user(AUTHOR), { ...payload(), consentGiven: false } as any),
    ).rejects.toThrow('FEEDBACK_CONSENT_REQUIRED');
    expect(model.docs).toHaveLength(0);
  });

  it('protects free text from other participants and from reasonless admins', async () => {
    const created = await submit();
    await expect(
      service.detail(user(OTHER), created.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.detail(user(ADMIN, Role.ADMIN), created.id),
    ).rejects.toThrow('FEEDBACK_FREE_TEXT_DENIED');

    const authorView = await service.detail(user(AUTHOR), created.id);
    expect(authorView.freeText).toBe('Relevant mentor suggestion');
    const adminView = await service.detail(
      user(ADMIN, Role.ADMIN),
      created.id,
      'quality audit',
    );
    expect(adminView.freeText).toBe('Relevant mentor suggestion');
  });

  it('suppresses free text after the retention deadline', async () => {
    const created = await submit();
    model.docs[0].retentionExpiresAt = new Date(Date.now() - 1000);
    const view = await service.detail(user(AUTHOR), created.id);
    expect(view.freeText).toBeNull();
    expect(view.retentionExpired).toBe(true);
  });

  it('404s for unknown ids', async () => {
    await expect(service.detail(user(AUTHOR), 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns only k-anonymized ratings to coordinators', async () => {
    model.aggregateRows = [
      {
        _id: { kind: FeedbackKind.RECOMMENDATION_RELEVANCE, rating: 4 },
        count: 6,
      },
      {
        _id: { kind: FeedbackKind.MATCH_QUALITY, rating: 2 },
        count: 3,
      },
    ];
    const result = await service.aggregate(
      user(COORDINATOR, Role.MODERATOR),
      {},
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe(FeedbackKind.RECOMMENDATION_RELEVANCE);
    expect(result[0].responses).toBe(6);
    expect(result[0].averageRating).toBe(4);
    expect(result[0].ratingDistribution).toEqual({ '4': 6 });

    const serialized = JSON.stringify(result);
    for (const forbidden of ['actorId', 'subjectId', 'freeText', 'idempotencyKeyHash']) {
      expect(serialized).not.toContain(forbidden);
    }
    const projectStage = model.lastPipeline.find((stage: any) => stage.$project);
    expect(projectStage.$project.actorId).toBe(0);
    expect(projectStage.$project.freeText).toBe(0);
    expect(projectStage.$project.rating).toBe(1);
  });

  it('denies aggregation to regular participants', async () => {
    await expect(service.aggregate(user(AUTHOR), {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
