import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

export interface SoftDeletableRecord {
  id: string;
  deletedAt?: string;
  hasActiveLoans?: boolean;
  hasLegalRetention?: boolean;
}

/**
 * Applies a common soft-delete policy to library records.
 *
 * softDelete() – marks a record as deleted; rejects if active loans or
 *                legal retention applies.
 * restore()    – restores a soft-deleted record where permitted.
 * filterActive() – excludes deleted records from default queries.
 *
 * Resolves #983
 */
@Injectable()
export class SoftDeleteService {
  /**
   * Soft-delete a record.
   * Protected from deletion when active loans or legal retention apply.
   */
  softDelete(record: SoftDeletableRecord): SoftDeletableRecord {
    if (!record) {
      throw new NotFoundException('Record not found.');
    }
    if (record.hasActiveLoans) {
      throw new BadRequestException(
        'Cannot delete a record with active loans.',
      );
    }
    if (record.hasLegalRetention) {
      throw new BadRequestException(
        'Cannot delete a record under legal retention.',
      );
    }
    if (record.deletedAt) {
      throw new BadRequestException('Record is already deleted.');
    }
    return { ...record, deletedAt: new Date().toISOString() };
  }

  /**
   * Restore a soft-deleted record.
   */
  restore(record: SoftDeletableRecord): SoftDeletableRecord {
    if (!record?.deletedAt) {
      throw new BadRequestException('Record is not deleted.');
    }
    const { deletedAt, ...restored } = record;
    return { ...restored };
  }

  /**
   * Filter out soft-deleted records for default (non-admin) queries.
   */
  filterActive<T extends SoftDeletableRecord>(records: T[]): T[] {
    return records.filter((r) => !r.deletedAt);
  }
}