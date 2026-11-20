import { ConfigureFundingModelDto } from './dto/configure-funding-model.dto';
import { CreateBudgetPlanDto } from './dto/create-budget-plan.dto';
import { ReserveBudgetDto } from './dto/reserve-budget.dto';
import { CreateEscrowIntentDto } from './dto/create-escrow-intent.dto';
import {
  BudgetCategory,
  EscrowAsset,
  FundingModel,
  ProjectFundingActorContext,
  ProjectFundingRole,
  ReleaseConditionType,
} from './entities';

export const FUTURE = '2099-01-01T00:00:00.000Z';

export const actor = (
  role: ProjectFundingRole = ProjectFundingRole.ADMIN,
  tenantId = 'tenant-alpha',
): ProjectFundingActorContext => ({
  id: `actor-${role}`,
  email: `${role}@example.com`,
  role,
  tenantId,
  requestId: 'request-1',
});

export const modelDto = (
  overrides: Partial<ConfigureFundingModelDto> = {},
): ConfigureFundingModelDto => ({
  requestId: 'model-request-1',
  tenantId: 'tenant-alpha',
  projectId: 'project-1',
  model: FundingModel.GRANT,
  asset: { code: 'XLM' },
  payerId: 'member-1',
  recipients: [{ memberId: 'member-2', shareBps: 10000 }],
  fees: { platformBps: 0, flat: 0 },
  committedAmountMinor: 1000000,
  expectedRevision: 0,
  fundingExpiresAt: FUTURE,
  ...overrides,
});

export const planDto = (
  overrides: Partial<CreateBudgetPlanDto> = {},
): CreateBudgetPlanDto => ({
  requestId: 'plan-request-1',
  tenantId: 'tenant-alpha',
  projectId: 'project-1',
  fundingModelId: 'model-project-1',
  charterId: 'charter-project-1',
  lines: [
    {
      id: 'line-1',
      category: BudgetCategory.EQUIPMENT,
      justification: 'Field laptops for the research team',
      quantity: 2,
      unitAmountMinor: 300000,
      fundingSource: 'sponsor-2026',
    },
  ],
  approvalThresholdMinor: 1000000,
  expectedRevision: 0,
  ...overrides,
});

export const reservationDto = (
  overrides: Partial<ReserveBudgetDto> = {},
): ReserveBudgetDto => ({
  requestId: 'reservation-request-1',
  tenantId: 'tenant-alpha',
  projectId: 'project-1',
  planId: 'plan-project-1',
  poolId: 'pool-project-1',
  amountMinor: 250000,
  currency: 'XLM',
  expectedRevision: 1,
  expiresAt: FUTURE,
  ...overrides,
});

export const intentDto = (
  overrides: Partial<CreateEscrowIntentDto> = {},
): CreateEscrowIntentDto => ({
  requestId: 'intent-request-1',
  tenantId: 'tenant-alpha',
  projectId: 'project-1',
  charterId: 'charter-project-1',
  payerId: 'member-1',
  amountMinor: 100000,
  asset: EscrowAsset.XLM,
  currency: 'XLM',
  expiresAt: FUTURE,
  conditions: [
    { type: ReleaseConditionType.DELIVERABLE_ACCEPTED, ref: 'deliverable-1' },
  ],
  expectedRevision: 2,
  ...overrides,
});
