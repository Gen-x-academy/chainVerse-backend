import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { AgreementPolicy } from './agreement.policy';
import { AgreementService } from './agreement.service';
import { CreateAgreementDto, AddApprovalDto } from './dto/agreement.dto';
import { AgreementStatus, ApprovalRole } from './schemas/agreement.schema';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

const MENTOR = '507f1f77bcf86cd799439001';
const MENTEE = '507f1f77bcf86cd799439002';
const COORDINATOR = '507f1f77bcf86cd799439003';
const OUTSIDER = '507f1f77bcf86cd799439004';
const PROGRAM = '507f1f77bcf86cd799439005';

const user = (id: string, role = Role.STUDENT): MentorshipUser => ({
  id,
  email: `${id}@example.com`,
  role,
});

const terms = () => ({
  goals: ['Ship a portfolio project'],
  scope: 'Backend mentorship for a capstone project',
  durationWeeks: 12,
  cadence: 'weekly',
  sessionsPerMonth: 4,
  sessionLengthMinutes: 60,
  pricePerSession: '120.00',
  currency: 'USD',
  cancellationPolicy: 'Cancel with 24 hours notice',
  conductPolicy: 'Be respectful and on time',
  evidenceRefs: ['repo-1'],
});

const payload = () => ({
  programId: PROGRAM,
  mentorId: MENTOR,
  menteeId: MENTEE,
  terms: terms(),
  privateNote: 'internal coordinator note',
  idempotencyKey: 'create-key-1',
});

class FakeAgreementModel {
  docs: any[] = [];
  private counter = 0;

  private matches(doc: any, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (key === 'approvals.userId' && value && typeof value === 'object') {
        const ne = (value as { $ne: string }).$ne;
        return !doc.approvals.some((a: any) => a.userId === ne);
      }
      return doc[key] === value;
    });
  }

  findOne(filter: Record<string, unknown>) {
    return {
      exec: async () => this.docs.find((d) => this.matches(d, filter)) ?? null,
    };
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
    if (this.docs.some((d) => d.clientKey === data.clientKey)) {
      const error: Error & { code?: number } = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    const doc = { _id: `agreement-${++this.counter}`, ...data };
    this.docs.push(doc);
    return doc;
  }

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, any>,
  ) {
    return {
      exec: async () => {
        const doc = this.docs.find((d) => this.matches(d, filter));
        if (!doc) return null;
        for (const [key, value] of Object.entries(update.$push ?? {})) {
          doc[key].push(value);
        }
        for (const [key, value] of Object.entries(update.$inc ?? {})) {
          doc[key] = (doc[key] ?? 0) + (value as number);
        }
        Object.assign(doc, update.$set ?? {});
        return doc;
      },
    };
  }
}

describe('Agreement DTOs', () => {
  it('accepts a full create payload', async () => {
    await expect(
      validate(CreateAgreementDto, payload()),
    ).resolves.toBeInstanceOf(CreateAgreementDto);
  });

  it.each([
    ['empty goals', { terms: { ...terms(), goals: [] } }],
    ['a bad currency', { terms: { ...terms(), currency: 'usd' } }],
    ['a bad price', { terms: { ...terms(), pricePerSession: '120.000' } }],
    ['a short session', { terms: { ...terms(), sessionLengthMinutes: 10 } }],
    ['an unknown field', { isActive: true }],
  ])('rejects %s', async (_label, patch) => {
    await expect(
      validate(CreateAgreementDto, { ...payload(), ...patch }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires explicit acceptance of terms', async () => {
    const approval = {
      role: ApprovalRole.MENTOR,
      termsVersion: 1,
      termsHash: 'a'.repeat(64),
      acceptTerms: true,
    };
    await expect(
      validate(AddApprovalDto, approval),
    ).resolves.toBeInstanceOf(AddApprovalDto);
    await expect(
      validate(AddApprovalDto, { ...approval, acceptTerms: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AgreementService', () => {
  let model: FakeAgreementModel;
  let service: AgreementService;
  let telemetry: { count: jest.Mock };

  beforeEach(() => {
    model = new FakeAgreementModel();
    telemetry = { count: jest.fn() };
    service = new AgreementService(
      model as any,
      new AgreementPolicy(telemetry as any),
      telemetry as any,
    );
  });

  const create = () => service.create(user(MENTOR, Role.TUTOR), payload() as any);

  it('creates an idempotent draft with privacy-safe terms', async () => {
    const first = await create();
    const replay = await create();
    expect(first.id).toBe(replay.id);
    expect(model.docs).toHaveLength(1);
    expect(first.status).toBe(AgreementStatus.DRAFT);
    expect(first.approvals).toHaveLength(0);
    expect(first).not.toHaveProperty('privateNote');
    expect(first.terms.goals).toEqual(['Ship a portfolio project']);
  });

  it('rejects incomplete terms and creation by an unrelated user', async () => {
    await expect(
      service.create(user(MENTOR, Role.TUTOR), {
        ...payload(),
        terms: { ...terms(), goals: [] },
      } as any),
    ).rejects.toThrow('AGREEMENT_TERMS_INCOMPLETE');
    await expect(
      service.create(user(OUTSIDER), payload() as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot activate until every configured approval is present', async () => {
    const draft = await create();
    await expect(
      service.activate(user(MENTEE), draft.id),
    ).rejects.toThrow('AGREEMENT_APPROVALS_INCOMPLETE');
  });

  it('records version-bound approvals idempotently then activates immutably', async () => {
    const draft = await create();
    const approval = {
      role: ApprovalRole.MENTOR,
      termsVersion: draft.termsVersion,
      termsHash: draft.termsHash,
      acceptTerms: true,
    };
    await service.addApproval(user(MENTOR, Role.TUTOR), draft.id, approval);
    const replay = await service.addApproval(
      user(MENTOR, Role.TUTOR),
      draft.id,
      approval,
    );
    expect(replay.approvals).toHaveLength(1);
    expect((replay.approvals[0] as Record<string, unknown>).userId).toBeUndefined();

    await service.addApproval(user(MENTEE), draft.id, {
      ...approval,
      role: ApprovalRole.MENTEE,
    });
    const active = await service.activate(user(MENTEE), draft.id);
    expect(active.status).toBe(AgreementStatus.ACTIVE);
    expect(active.activatedAt).toBeInstanceOf(Date);
    expect(
      (await service.activate(user(MENTEE), draft.id)).status,
    ).toBe(AgreementStatus.ACTIVE);

    await expect(
      service.addApproval(user(MENTOR, Role.TUTOR), draft.id, {
        ...approval,
        role: ApprovalRole.MENTEE,
      }),
    ).rejects.toThrow('AGREEMENT_IMMUTABLE');
  });

  it('rejects stale terms and wrong-role approvals', async () => {
    const draft = await create();
    const approval = {
      role: ApprovalRole.MENTOR,
      termsVersion: 99,
      termsHash: 'b'.repeat(64),
      acceptTerms: true,
    };
    await expect(
      service.addApproval(user(MENTOR, Role.TUTOR), draft.id, approval),
    ).rejects.toThrow('AGREEMENT_TERMS_STALE');
    await expect(
      service.addApproval(user(MENTOR, Role.TUTOR), draft.id, {
        ...approval,
        termsVersion: draft.termsVersion,
        termsHash: draft.termsHash,
        role: ApprovalRole.MENTEE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the coordinator note out of participant snapshots', async () => {
    const draft = await service.create(
      user(COORDINATOR, Role.MODERATOR),
      payload() as any,
    );
    const participant = await service.snapshot(user(MENTEE), draft.id);
    expect(participant).not.toHaveProperty('privateNote');
    expect(participant.approvals).toEqual([]);

    const full = await service.inspect(user(COORDINATOR, Role.MODERATOR), draft.id);
    expect(full.privateNote).toBe('internal coordinator note');
    await expect(
      service.inspect(user(MENTEE), draft.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ends an active agreement and refuses to reactivate it', async () => {
    const draft = await create();
    await service.addApproval(user(MENTOR, Role.TUTOR), draft.id, {
      role: ApprovalRole.MENTOR,
      termsVersion: draft.termsVersion,
      termsHash: draft.termsHash,
      acceptTerms: true,
    });
    await service.addApproval(user(MENTEE), draft.id, {
      role: ApprovalRole.MENTEE,
      termsVersion: draft.termsVersion,
      termsHash: draft.termsHash,
      acceptTerms: true,
    });
    await service.activate(user(MENTEE), draft.id);
    const ended = await service.end(user(MENTEE), draft.id, {
      reason: 'Mentor unavailable',
      idempotencyKey: 'end-1',
    });
    expect(ended.status).toBe(AgreementStatus.ENDED);
    await expect(
      service.activate(user(MENTEE), draft.id),
    ).rejects.toThrow('AGREEMENT_ENDED');
  });
});
