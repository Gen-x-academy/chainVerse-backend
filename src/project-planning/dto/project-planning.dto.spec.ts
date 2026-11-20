import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AddMitigationDto,
  AddProjectMemberDto,
  CreatePhaseDto,
  CreateProjectDto,
  CreateRiskDto,
  DecideExtensionDto,
  RecordCheckInDto,
  RequestExtensionDto,
} from './project-planning.dto';
import {
  ExtensionStatus,
  PlanningRole,
  RiskLikelihood,
  RiskSeverity,
} from '../project-planning.types';

const key = 'retry-key-0001';

describe('Project planning DTO validation', () => {
  it('accepts progress at both boundaries and rejects out-of-range values', async () => {
    for (const percentage of [0, 100]) {
      const dto = plainToInstance(RecordCheckInDto, {
        idempotencyKey: key,
        percentage,
      });
      expect(await validate(dto)).toEqual([]);
    }
    for (const percentage of [-1, 101, 12.5]) {
      const dto = plainToInstance(RecordCheckInDto, {
        idempotencyKey: key,
        percentage,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });

  it('requires severity and likelihood for risks', async () => {
    const valid = plainToInstance(CreateRiskDto, {
      idempotencyKey: key,
      title: 'Vendor delay',
      severity: RiskSeverity.HIGH,
      likelihood: RiskLikelihood.MEDIUM,
    });
    expect(await validate(valid)).toEqual([]);

    for (const invalid of [
      {
        idempotencyKey: key,
        title: 'Vendor delay',
        likelihood: RiskLikelihood.MEDIUM,
      },
      {
        idempotencyKey: key,
        title: 'Vendor delay',
        severity: RiskSeverity.HIGH,
      },
    ]) {
      const dto = plainToInstance(CreateRiskDto, invalid);
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });

  it('requires an owner and plan when mitigation is added', async () => {
    const missingOwner = plainToInstance(AddMitigationDto, {
      idempotencyKey: key,
      plan: 'Negotiate fallback supplier',
    });
    const missingPlan = plainToInstance(AddMitigationDto, {
      idempotencyKey: key,
      ownerId: 'user-2',
    });
    expect((await validate(missingOwner)).length).toBeGreaterThan(0);
    expect((await validate(missingPlan)).length).toBeGreaterThan(0);
  });

  it('rejects invalid roadmap dates', async () => {
    const dto = plainToInstance(CreatePhaseDto, {
      idempotencyKey: key,
      name: 'Discovery',
      startDate: 'not-a-date',
      endDate: '2026-04-01T00:00:00.000Z',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('requires a reason and bounded extension days', async () => {
    const dto = plainToInstance(RequestExtensionDto, {
      idempotencyKey: key,
      requestedDays: 91,
      reason: 'Supplier slip',
    });
    const noReason = plainToInstance(RequestExtensionDto, {
      idempotencyKey: key,
      requestedDays: 5,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
    expect((await validate(noReason)).length).toBeGreaterThan(0);
  });

  it('validates decisions and idempotency key format', async () => {
    const badDecision = plainToInstance(DecideExtensionDto, {
      idempotencyKey: key,
      decision: 'approve',
    });
    const badKey = plainToInstance(CreateProjectDto, {
      idempotencyKey: 'x',
      name: 'Project',
      deadline: '2026-12-01T00:00:00.000Z',
    });
    const validDecision = plainToInstance(DecideExtensionDto, {
      idempotencyKey: key,
      decision: ExtensionStatus.APPROVED,
    });
    expect((await validate(badDecision)).length).toBeGreaterThan(0);
    expect((await validate(badKey)).length).toBeGreaterThan(0);
    expect(await validate(validDecision)).toEqual([]);
  });

  it('validates project member roles', async () => {
    const valid = plainToInstance(AddProjectMemberDto, {
      idempotencyKey: key,
      userId: 'user-2',
      role: PlanningRole.APPROVER,
    });
    const invalid = plainToInstance(AddProjectMemberDto, {
      idempotencyKey: key,
      userId: 'user-2',
      role: 'superuser',
    });
    expect(await validate(valid)).toEqual([]);
    expect((await validate(invalid)).length).toBeGreaterThan(0);
  });
});
