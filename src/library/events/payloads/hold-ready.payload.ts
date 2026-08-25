/** Payload emitted when a held item is ready for pickup. */
export class HoldReadyPayload {
  holdId: string;
  patronId: string;
  itemId: string;
  /** Pickup window closes at this ISO-8601 date-time. */
  expiresAt: string;
}