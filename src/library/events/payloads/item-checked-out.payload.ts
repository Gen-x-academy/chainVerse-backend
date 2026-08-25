/** Payload emitted when a patron checks out an item. */
export class ItemCheckedOutPayload {
  /** Unique loan / transaction ID for idempotent consumers. */
  loanId: string;
  patronId: string;
  itemId: string;
  /** ISO-8601 date-time string. */
  dueAt: string;
}