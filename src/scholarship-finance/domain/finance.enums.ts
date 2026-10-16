/**
 * Organization-member roles that grant access to scholarship finance.
 * Stored in `OrganizationMember.role`; platform admins (Role.ADMIN) hold
 * every permission across tenants.
 */
export enum FinanceMemberRole {
  VIEWER = 'finance_viewer',
  OPERATOR = 'finance_operator',
  APPROVER = 'finance_approver',
}

export enum FinancePermission {
  /** Read balances, deposits, refunds, recoveries, audit trail. */
  VIEW = 'finance:view',
  /** Record deposits, request refunds, draft recovery claims, record collections. */
  OPERATE = 'finance:operate',
  /** Credit deposits, approve refunds/recoveries, reallocate funds, publish fee schedules. */
  APPROVE = 'finance:approve',
}

export const MEMBER_ROLE_PERMISSIONS: Record<
  FinanceMemberRole,
  FinancePermission[]
> = {
  [FinanceMemberRole.VIEWER]: [FinancePermission.VIEW],
  [FinanceMemberRole.OPERATOR]: [
    FinancePermission.VIEW,
    FinancePermission.OPERATE,
  ],
  [FinanceMemberRole.APPROVER]: [
    FinancePermission.VIEW,
    FinancePermission.OPERATE,
    FinancePermission.APPROVE,
  ],
};

export enum DepositRail {
  STELLAR = 'stellar',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  MANUAL = 'manual',
}

export enum DepositStatus {
  PENDING = 'pending',
  CREDITED = 'credited',
  REJECTED = 'rejected',
  PARTIALLY_REFUNDED = 'partially_refunded',
  REFUNDED = 'refunded',
  REVERSED = 'reversed',
}

export enum FundingRoundStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export enum FeeKind {
  PLATFORM = 'platform',
  NETWORK = 'network',
}

export enum FeeEvent {
  /** Fees deducted from what the sponsor sent (inclusive). */
  DEPOSIT = 'deposit',
  /** Fees added on top of what the recipient receives (exclusive). */
  DISBURSEMENT = 'disbursement',
}

export enum RoundingMode {
  HALF_UP = 'half_up',
  HALF_EVEN = 'half_even',
  FLOOR = 'floor',
  CEIL = 'ceil',
}

export enum RefundType {
  SPONSOR_REFUND = 'sponsor_refund',
  REJECTED_TRANSFER = 'rejected_transfer',
  OVERPAYMENT = 'overpayment',
  UNUSED_BALANCE = 'unused_balance',
}

export enum RefundStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum RecoveryReason {
  FRAUD = 'fraud',
  WITHDRAWAL = 'withdrawal',
  MILESTONE_FAILURE = 'milestone_failure',
}

export enum RecoveryStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  PARTIALLY_COLLECTED = 'partially_collected',
  SETTLED = 'settled',
  WRITTEN_OFF = 'written_off',
  CANCELLED = 'cancelled',
}

/**
 * How a recovery collection was received. There is deliberately no
 * "wallet debit" method: the platform never pulls funds from a recipient.
 */
export enum CollectionMethod {
  VOLUNTARY_REPAYMENT = 'voluntary_repayment',
  MANUAL_TRANSFER = 'manual_transfer',
  /** Offset against a future award — requires a recorded recipient consent reference. */
  AWARD_OFFSET = 'award_offset',
}

export enum LedgerSourceType {
  DEPOSIT_CREDIT = 'deposit_credit',
  REALLOCATION = 'reallocation',
  REFUND_RESERVATION = 'refund_reservation',
  REFUND_PAYOUT = 'refund_payout',
  DEPOSIT_REVERSAL = 'deposit_reversal',
  RECOVERY_OPENED = 'recovery_opened',
  RECOVERY_COLLECTION = 'recovery_collection',
  RECOVERY_WRITE_OFF = 'recovery_write_off',
  RECOVERY_CANCELLED = 'recovery_cancelled',
  REVERSAL = 'reversal',
}
