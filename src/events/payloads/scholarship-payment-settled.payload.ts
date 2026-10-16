export class ScholarshipPaymentSettledPayload {
  paymentId: string;
  organizationId: string;
  recipientId: string;
  /** `successful`, `failed`, `expired` or `reversed`. */
  status: string;
  txHash: string | null;
}
