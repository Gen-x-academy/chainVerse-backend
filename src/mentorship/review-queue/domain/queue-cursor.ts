import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { ErrorCode } from '../../../common/errors';
import { MentorshipValidationException } from '../../shared/joi-validation.pipe';

export const QUEUE_SORTS = ['priority', 'due', 'submitted'] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

interface SortKey {
  field: string;
  dir: 1 | -1;
  kind: 'number' | 'date';
}

/**
 * Every sort ends with `_id` so ordering is total and stable: two requests
 * with the same filters always return items in the same order, and keyset
 * pagination never skips or repeats items when new applications arrive.
 */
export const SORT_KEYS: Record<QueueSort, SortKey[]> = {
  priority: [
    { field: 'review.priorityRank', dir: -1, kind: 'number' },
    { field: 'review.dueAt', dir: 1, kind: 'date' },
  ],
  due: [{ field: 'review.dueAt', dir: 1, kind: 'date' }],
  submitted: [{ field: 'submittedAt', dir: 1, kind: 'date' }],
};

export function mongoSort(sort: QueueSort): Record<string, 1 | -1> {
  return Object.fromEntries([...SORT_KEYS[sort].map((k) => [k.field, k.dir]), ['_id', 1]]);
}

interface CursorPayload {
  s: QueueSort;
  f: string; // filter fingerprint
  v: Array<number | string>;
  id: string;
}

export function filterFingerprint(filters: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.keys(filters).sort().map((k) => [k, filters[k]]));
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 16);
}

export function encodeCursor(sort: QueueSort, fingerprint: string, doc: Record<string, any>): string {
  const v = SORT_KEYS[sort].map((k) => {
    const raw = k.field.split('.').reduce((o, p) => o?.[p], doc);
    return k.kind === 'date' ? new Date(raw).toISOString() : Number(raw);
  });
  const payload: CursorPayload = { s: sort, f: fingerprint, v, id: String(doc._id) };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes a cursor into a keyset `$or` filter. Rejects cursors issued for a
 * different sort or different filters, so a client cannot page a list that
 * silently changed underneath it.
 */
export function cursorFilter(cursor: string, sort: QueueSort, fingerprint: string): Record<string, unknown> {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      payload.s !== sort ||
      payload.f !== fingerprint ||
      !Array.isArray(payload.v) ||
      payload.v.length !== SORT_KEYS[sort].length ||
      !Types.ObjectId.isValid(payload.id)
    ) {
      throw new Error('mismatch');
    }
  } catch {
    throw new MentorshipValidationException(
      'Cursor is invalid or was issued for different filters; restart from the first page',
      [{ field: 'cursor', issue: 'invalid or stale cursor' }],
      ErrorCode.MENTOR_INVALID_CURSOR,
    );
  }

  const keys = SORT_KEYS[sort];
  const values = payload.v.map((v, i) => (keys[i].kind === 'date' ? new Date(v) : Number(v)));
  const or: Record<string, unknown>[] = [];

  // (k1 > v1) OR (k1 = v1 AND k2 > v2) OR … OR (all equal AND _id > id)
  for (let i = 0; i <= keys.length; i++) {
    const clause: Record<string, unknown> = {};
    for (let j = 0; j < i; j++) clause[keys[j].field] = values[j];
    if (i < keys.length) {
      clause[keys[i].field] = { [keys[i].dir === 1 ? '$gt' : '$lt']: values[i] };
    } else {
      clause._id = { $gt: new Types.ObjectId(payload.id) };
    }
    or.push(clause);
  }
  return { $or: or };
}
