/** Payload emitted when a hold expires without being collected. */
export class HoldExpiredPayload {
  holdId: string;
  patronId: string;
  itemId: string;
  expiredAt: string;
}