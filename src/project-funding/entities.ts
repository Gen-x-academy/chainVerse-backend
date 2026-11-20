export enum FundingModel {
  UNFUNDED = 'unfunded',
  GRANT = 'grant',
  MILESTONE = 'milestone',
  REIMBURSEMENT = 'reimbursement',
  STIPEND = 'stipend',
  BOUNTY = 'bounty',
  SPONSOR_FUNDED = 'sponsor-funded',
}

export enum BudgetCategory {
  PERSONNEL = 'personnel',
  EQUIPMENT = 'equipment',
  SOFTWARE = 'software',
  TRAVEL = 'travel',
  RESEARCH = 'research',
  CONTINGENCY = 'contingency',
  OTHER = 'other',
}

export enum EscrowAsset {
  USD = 'USD',
  USDC = 'USDC',
  XLM = 'XLM',
}

export enum ReleaseConditionType {
  DELIVERABLE_ACCEPTED = 'deliverable_accepted',
  CHALLENGE_WINDOW_CLOSED = 'challenge_window_closed',
  MILESTONE_APPROVED = 'milestone_approved',
  ATTESTATION = 'attestation',
}

export enum ProjectFundingRole {
  SPONSOR = 'sponsor',
  FINANCE = 'finance',
  PROGRAM_MANAGER = 'program-manager',
  ADMIN = 'admin',
  STUDENT = 'student',
}

export const PROJECT_FUNDING_WRITE_ROLES: readonly ProjectFundingRole[] = [
  ProjectFundingRole.SPONSOR,
  ProjectFundingRole.FINANCE,
  ProjectFundingRole.PROGRAM_MANAGER,
  ProjectFundingRole.ADMIN,
];

export const PROJECT_FUNDING_APPROVER_ROLES: readonly ProjectFundingRole[] = [
  ProjectFundingRole.FINANCE,
  ProjectFundingRole.PROGRAM_MANAGER,
  ProjectFundingRole.ADMIN,
];

export const PAID_FUNDING_MODELS: readonly FundingModel[] = [
  FundingModel.GRANT,
  FundingModel.MILESTONE,
  FundingModel.REIMBURSEMENT,
  FundingModel.STIPEND,
  FundingModel.BOUNTY,
  FundingModel.SPONSOR_FUNDED,
];

export interface FundingAsset {
  code: string;
  issuer?: string;
}

export interface FundingRecipient {
  memberId: string;
  shareBps: number;
}

export interface FundingFees {
  platformBps: number;
  flat: number;
}

export interface FundingPool {
  poolId: string;
  tenantId: string;
  projectId: string;
  currency: string;
  capMinor: number;
  expiresAt: string;
}

export interface FundingModelRecord {
  id: string;
  tenantId: string;
  projectId: string;
  model: FundingModel;
  asset: FundingAsset;
  payerId: string;
  recipients: FundingRecipient[];
  fees: FundingFees;
  committedAmountMinor: number;
  revision: number;
  createdAt: string;
  pool: FundingPool;
}

export interface BudgetLineRecord {
  id: string;
  category: BudgetCategory;
  justification: string;
  quantity: number;
  unitAmountMinor: number;
  fundingSource: string;
  lineTotalMinor: number;
}

export interface BudgetPlanRecord {
  planId: string;
  tenantId: string;
  projectId: string;
  fundingModelId: string;
  charterId: string;
  currency: string;
  version: number;
  revision: number;
  status: 'approved';
  totalMinor: number;
  byCategory: Record<string, number>;
  lines: BudgetLineRecord[];
  createdAt: string;
}

export interface BudgetReservationRecord {
  reservationId: string;
  tenantId: string;
  projectId: string;
  planId: string;
  poolId: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  expiresAt: string;
  revision: number;
}

export interface ReleaseCondition {
  type: ReleaseConditionType;
  ref: string;
}

export interface EscrowIntentRecord {
  intentId: string;
  tenantId: string;
  projectId: string;
  charterId: string;
  payerId: string;
  amountMinor: number;
  asset: EscrowAsset;
  currency: string;
  createdAt: string;
  expiresAt: string;
  conditions: ReleaseCondition[];
  revision: number;
}

export interface ProjectFundingActorContext {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  requestId: string;
}

export interface IdempotencyReceipt {
  fingerprint: string;
  result: unknown;
}
