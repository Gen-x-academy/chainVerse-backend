/** Payload emitted when a fine or charge is applied to a patron account. */
export class ChargeAppliedPayload {
  chargeId: string;
  patronId: string;
  /** Amount in the platform's base currency unit (e.g. cents). */
  amountCents: number;
  reason: string;
}