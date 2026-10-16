export class ScholarshipPayoutWalletChangedPayload {
  organizationId: string;
  recipientId: string;
  previousAddress: string;
  newAddress: string;
  /** Scheduled payments placed on hold by the change. */
  heldPayments: number;
}
