/** Domain events published by the scholarship finance module. */
export const ScholarshipFinanceEvents = {
  LEDGER_ENTRY_POSTED: 'scholarship.ledger.entry-posted',
  PAYOUT_ATTEMPT_READY: 'scholarship.payout.attempt-ready',
  PAYOUT_FAILED: 'scholarship.payout.failed',
  PAYOUT_SUCCEEDED: 'scholarship.payout.succeeded',
  RECEIPT_ISSUED: 'scholarship.receipt.issued',
  RECONCILIATION_COMPLETED: 'scholarship.reconciliation.completed',
  RECONCILIATION_ALERT_RAISED: 'scholarship.reconciliation.alert-raised',
} as const;

export interface PayoutFailedPayload {
  organizationId: string;
  programId: string;
  payoutId: string;
  awardId: string;
  category: string;
  operatorAction: string;
  retryable: boolean;
}

export interface ReceiptIssuedPayload {
  organizationId: string;
  receiptId: string;
  receiptNumber: string;
  recipientId: string;
  amount: string;
  assetCode: string;
}

export interface ReconciliationAlertPayload {
  organizationId: string;
  programId: string;
  alertId: string;
  type: string;
  severity: string;
  message: string;
}
