import { LedgerEntryEventType } from '../schemas/point-ledger-entry.schema';

export class CreatePointLedgerEntryDto {
  userId!: string;
  eventType!: LedgerEntryEventType;
  amount!: number;
  source!: string;
  idempotencyKey!: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}
