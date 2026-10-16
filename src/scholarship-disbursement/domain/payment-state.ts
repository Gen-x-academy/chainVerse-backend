/**
 * Lifecycle of a scheduled scholarship installment.
 *
 * ```
 *  scheduled ──claim──▶ submitted ──seen in ledger──▶ pending ──N confirmations──▶ successful ──▶ reversed
 *     │  ▲                  │  │                         │
 *     │  └─release── on_hold  │  └──maxTime passed, unseen─▶ expired ──retry──▶ scheduled
 *     │                     └──rejected / failed on-chain──▶ failed  ──retry──▶ scheduled
 *     └──────────────────────▶ cancelled
 * ```
 *
 * Network-driven transitions (`submitted` → `pending` → `successful`, and the
 * failure/expiry branches) only happen on verified Horizon evidence. Every
 * transition is applied as a compare-and-set on the current status, so two
 * workers racing on the same payment cannot both win.
 */
export enum ScholarshipPaymentStatus {
  SCHEDULED = 'scheduled',
  ON_HOLD = 'on_hold',
  SUBMITTED = 'submitted',
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REVERSED = 'reversed',
  CANCELLED = 'cancelled',
}

export enum PaymentHoldReason {
  PAYOUT_WALLET_CHANGED = 'payout_wallet_changed',
}

const TRANSITIONS: Record<
  ScholarshipPaymentStatus,
  readonly ScholarshipPaymentStatus[]
> = {
  [ScholarshipPaymentStatus.SCHEDULED]: [
    ScholarshipPaymentStatus.SUBMITTED,
    ScholarshipPaymentStatus.ON_HOLD,
    ScholarshipPaymentStatus.CANCELLED,
  ],
  [ScholarshipPaymentStatus.ON_HOLD]: [
    ScholarshipPaymentStatus.SCHEDULED,
    ScholarshipPaymentStatus.CANCELLED,
  ],
  [ScholarshipPaymentStatus.SUBMITTED]: [
    ScholarshipPaymentStatus.PENDING,
    ScholarshipPaymentStatus.FAILED,
    ScholarshipPaymentStatus.EXPIRED,
  ],
  [ScholarshipPaymentStatus.PENDING]: [
    ScholarshipPaymentStatus.SUCCESSFUL,
    ScholarshipPaymentStatus.FAILED,
  ],
  [ScholarshipPaymentStatus.SUCCESSFUL]: [ScholarshipPaymentStatus.REVERSED],
  [ScholarshipPaymentStatus.FAILED]: [ScholarshipPaymentStatus.SCHEDULED],
  [ScholarshipPaymentStatus.EXPIRED]: [ScholarshipPaymentStatus.SCHEDULED],
  [ScholarshipPaymentStatus.REVERSED]: [],
  [ScholarshipPaymentStatus.CANCELLED]: [],
};

export function canTransition(
  from: ScholarshipPaymentStatus,
  to: ScholarshipPaymentStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses from which the given status can be reached. */
export function sourcesOf(
  to: ScholarshipPaymentStatus,
): ScholarshipPaymentStatus[] {
  return (Object.keys(TRANSITIONS) as ScholarshipPaymentStatus[]).filter(
    (from) => canTransition(from, to),
  );
}

/** Statuses with a transaction on (or headed to) the network. */
export const IN_FLIGHT_STATUSES: readonly ScholarshipPaymentStatus[] = [
  ScholarshipPaymentStatus.SUBMITTED,
  ScholarshipPaymentStatus.PENDING,
];
