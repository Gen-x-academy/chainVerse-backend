export class LibraryCheckoutReceiptCreatedPayload {
  patronId: string;
  transactionId: string;
  itemTitle: string;
  dueAt: Date;
}

export class LibraryReturnReceiptCreatedPayload {
  patronId: string;
  transactionId: string;
  itemTitle: string;
  returnedAt: Date;
}
