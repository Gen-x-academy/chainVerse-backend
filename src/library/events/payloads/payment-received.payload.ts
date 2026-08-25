/** Payload emitted when a patron payment is recorded. */
export class PaymentReceivedPayload {
  paymentId: string;
  patronId: string;
  amountCents: number;
  paidAt: string;
}