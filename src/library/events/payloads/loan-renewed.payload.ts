/** Payload emitted when a loan is renewed. */
export class LoanRenewedPayload {
  loanId: string;
  patronId: string;
  itemId: string;
  newDueAt: string;
}