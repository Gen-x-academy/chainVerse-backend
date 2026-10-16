import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

export type CatalogStatus = 'draft' | 'published' | 'archived' | 'withdrawn';

export interface CatalogRecord {
  id: string;
  title: string;
  status: CatalogStatus;
  updatedAt: string;
}

const VALID_TRANSITIONS: Record<CatalogStatus, CatalogStatus[]> = {
  draft: ['published'],
  published: ['archived', 'withdrawn'],
  archived: ['published'],
  withdrawn: [],
};

/**
 * Manages catalog record lifecycle: draft -> published -> archived/withdrawn.
 *
 * transition() – validates and applies a status change.
 * isLendable()  – returns true only for published records.
 * isVisible()   – public search returns only published records.
 *
 * Resolves #987
 */
@Injectable()
export class CatalogLifecycleService {
  /**
   * Transition a catalog record to a new status.
   * Throws BadRequestException for invalid transitions.
   */
  transition(record: CatalogRecord, next: CatalogStatus): CatalogRecord {
    const allowed = VALID_TRANSITIONS[record.status];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from '${record.status}' to '${next}'.`,
      );
    }
    return { ...record, status: next, updatedAt: new Date().toISOString() };
  }

  /**
   * Only published records are lendable.
   * Withdrawn records block new loans without affecting existing ones.
   */
  isLendable(record: CatalogRecord): boolean {
    return record.status === 'published';
  }

  /**
   * Public catalog search returns only published records.
   */
  isVisible(record: CatalogRecord): boolean {
    return record.status === 'published';
  }

  /**
   * Filter a list of catalog records to only visible (published) ones.
   */
  filterVisible(records: CatalogRecord[]): CatalogRecord[] {
    return records.filter((r) => this.isVisible(r));
  }
}