import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { AcceptAgreementDto, PublishAgreementTermsDto } from './dto/agreement-acceptance.dto';
import {
  AgreementAcceptanceService,
  AcceptanceActor,
} from './agreement-acceptance.service';
import { AcceptanceIntent, computeTermsHash } from './schemas/agreement-acceptance.schema';

const AGREEMENT_ID = new Types.ObjectId().toString();
const ALICE = 'mentor-alice';
const BOB = 'student-bob';
const CAROL = 'outsider-carol';

const admin: AcceptanceActor = { id: 'admin-1', role: Role.ADMIN };
const alice: AcceptanceActor = { id: ALICE, role: Role.TUTOR };
const carol: AcceptanceActor = { id: CAROL, role: Role.STUDENT };

const terms = { cadence: 'weekly', price: 100, scope: 'backend' };

function matches(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

/** Minimal in-memory stand-in for a Mongoose model (no database required). */
class FakeModel {
  rows: Record<string, any>[] = [];
  failNextCreate = false;

  private query(filter: Record<string, unknown>, all: boolean) {
    const chain: any = {
      sortOrder: null as Record<string, number> | null,
      sort(order: Record<string, number>) {
        this.sortOrder = order;
        return this;
      },
      exec: async () => {
        let result = this.rows.filter((row) => matches(row, filter));
        if (chain.sortOrder) {
          const [key, direction] = Object.entries(chain.sortOrder)[0] as [string, number];
          result = [...result].sort(
            (a, b) => (Number(a[key]) - Number(b[key])) * direction,
          );
        }
        return all ? result : result[0] ?? null;
      },
    };
    return chain;
  }

  findOne = (filter: Record<string, unknown>) => this.query(filter, false);
  find = (filter: Record<string, unknown>) => this.query(filter, true);

  create = async (doc: Record<string, any>) => {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }
    const row = { _id: new Types.ObjectId(), createdAt: new Date(), ...doc };
    this.rows.push(row);
    return row;
  };
}

function setup() {
  const termsModel = new FakeModel();
  const acceptances = new FakeModel();
  const telemetry = { count: jest.fn() };
  const service = new AgreementAcceptanceService(
    termsModel as never,
    acceptances as never,
    telemetry as never,
  );
  return { service, termsModel, acceptances, telemetry };
}

async function publishCurrent(termsModel: FakeModel, version = 1, body = terms) {
  await termsModel.create({
    _id: new Types.ObjectId(),
    agreementId: AGREEMENT_ID,
    version,
    participantIds: [ALICE, BOB],
    terms: body,
    termsHash: computeTermsHash(body),
    effectiveAt: new Date(),
  });
  return computeTermsHash(body);
}

function acceptDto(overrides: Partial<AcceptAgreementDto> = {}): AcceptAgreementDto {
  return plainToInstance(AcceptAgreementDto, {
    version: 1,
    termsHash: computeTermsHash(terms),
    termVersions: { cadence: 1, price: 1 },
    nonce: 'nonce-alice-0000001',
    intent: AcceptanceIntent.ACCEPT,
    ...overrides,
  });
}

describe('Agreement acceptance DTO validation', () => {
  it('accepts a well-formed acceptance', async () => {
    await expect(validate(acceptDto())).resolves.toEqual([]);
  });

  it.each([
    ['a short nonce', { nonce: 'short' }],
    ['a nonce with illegal characters', { nonce: '!!!!!not-allowed-000' }],
    ['a malformed hash', { termsHash: 'nope' }],
    ['a zero version', { version: 0 }],
    ['a non-object termVersions', { termVersions: 'bad' }],
    ['a wrong intent', { intent: 'DECLINE' }],
  ])('rejects %s', async (_label, override) => {
    const errors = await validate(acceptDto(override));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a terms document with no participants', async () => {
    const dto = plainToInstance(PublishAgreementTermsDto, {
      agreementId: AGREEMENT_ID,
      version: 1,
      participantIds: [],
      terms,
      effectiveAt: new Date().toISOString(),
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('AgreementAcceptanceService publishing', () => {
  it('lets a coordinator publish an immutable, hashed terms version', async () => {
    const { service, termsModel } = setup();
    const dto: PublishAgreementTermsDto = {
      agreementId: AGREEMENT_ID,
      version: 1,
      participantIds: [ALICE, BOB],
      terms,
      effectiveAt: new Date().toISOString(),
    };

    const published = await service.publishTerms(admin, dto);

    expect(published.version).toBe(1);
    expect(published.termsHash).toBe(computeTermsHash(terms));
    expect(termsModel.rows).toHaveLength(1);
  });

  it('is idempotent when the same version is republished unchanged', async () => {
    const { service, termsModel } = setup();
    const dto: PublishAgreementTermsDto = {
      agreementId: AGREEMENT_ID,
      version: 1,
      participantIds: [ALICE, BOB],
      terms,
      effectiveAt: new Date().toISOString(),
    };
    const first = await service.publishTerms(admin, dto);
    const second = await service.publishTerms(admin, dto);

    expect(String(second._id)).toBe(String(first._id));
    expect(termsModel.rows).toHaveLength(1);
  });

  it('denies publishing to a regular participant (deny by default)', async () => {
    const { service } = setup();
    const dto: PublishAgreementTermsDto = {
      agreementId: AGREEMENT_ID,
      version: 1,
      participantIds: [ALICE, BOB],
      terms,
      effectiveAt: new Date().toISOString(),
    };
    await expect(service.publishTerms(alice, dto)).rejects.toMatchObject({
      errorCode: ErrorCode.MENTOR_ACCESS_DENIED,
    });
  });
});

describe('AgreementAcceptanceService acceptance', () => {
  it('records an explicit acceptance with a privacy-safe proof', async () => {
    const { service, termsModel, acceptances } = setup();
    const hash = await publishCurrent(termsModel);

    const proof = await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));

    expect(proof.actorId).toBe(ALICE);
    expect(proof.termsHash).toBe(hash);
    expect(proof).not.toHaveProperty('intent');
    expect(proof).not.toHaveProperty('terms');
    expect(acceptances.rows).toHaveLength(1);
  });

  it('denies a non-participant, including a privileged one (no acting on behalf)', async () => {
    const { service, termsModel } = setup();
    const hash = await publishCurrent(termsModel);

    await expect(
      service.accept(carol, AGREEMENT_ID, acceptDto({ termsHash: hash, nonce: 'nonce-carol-00000001' })),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
    await expect(
      service.accept({ id: CAROL, role: Role.ADMIN }, AGREEMENT_ID, acceptDto({ termsHash: hash, nonce: 'nonce-carol-00000002' })),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('rejects a stale version so changed terms invalidate prior acceptance', async () => {
    const { service, termsModel } = setup();
    await publishCurrent(termsModel, 1);
    await publishCurrent(termsModel, 2, { ...terms, cadence: 'daily' });

    await expect(
      service.accept(alice, AGREEMENT_ID, acceptDto({ version: 1 })),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MENTOR_STALE_VERSION });
  });

  it('is idempotent for a repeated acceptance of the same version', async () => {
    const { service, termsModel, acceptances } = setup();
    const hash = await publishCurrent(termsModel);

    const first = await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));
    const second = await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));

    expect(second.id).toBe(first.id);
    expect(acceptances.rows).toHaveLength(1);
  });

  it('returns the winner when a duplicate-key race is lost', async () => {
    const { service, termsModel, acceptances } = setup();
    const hash = await publishCurrent(termsModel);
    await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));
    acceptances.failNextCreate = true;

    const replay = await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));

    expect(replay.actorId).toBe(ALICE);
    expect(acceptances.rows).toHaveLength(1);
  });

  it('hides a proof from another participant', async () => {
    const { service, termsModel } = setup();
    const hash = await publishCurrent(termsModel);
    await service.accept(alice, AGREEMENT_ID, acceptDto({ termsHash: hash }));

    await expect(
      service.proof(bobActor(), AGREEMENT_ID, 1, ALICE),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});

function bobActor(): AcceptanceActor {
  return { id: BOB, role: Role.STUDENT };
}
