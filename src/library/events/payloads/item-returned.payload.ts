/** Payload emitted when a patron returns an item. */
export class ItemReturnedPayload {
  loanId: string;
  patronId: string;
  itemId: string;
  returnedAt: string;
}