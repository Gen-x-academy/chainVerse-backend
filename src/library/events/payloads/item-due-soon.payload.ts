/** Payload emitted when an item is approaching its due date. */
export class ItemDueSoonPayload {
  loanId: string;
  patronId: string;
  itemId: string;
  dueAt: string;
  /** How many hours remain until the item is due. */
  hoursRemaining: number;
}