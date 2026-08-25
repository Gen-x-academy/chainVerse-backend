/** Payload emitted when an item is past its due date. */
export class ItemOverduePayload {
  loanId: string;
  patronId: string;
  itemId: string;
  dueAt: string;
  /** How many hours have elapsed since the due date. */
  hoursOverdue: number;
}