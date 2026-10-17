export enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
}

export enum MentorshipMode {
  VIDEO = 'video',
  AUDIO = 'audio',
  CHAT = 'chat',
  IN_PERSON = 'in_person',
}

/**
 * Top-level draft fields tracked for revisions and timestamps. Program answers
 * are tracked per question as `answers:<questionKey>`.
 */
export const DRAFT_FIELDS = [
  'goals',
  'expectations',
  'schedule',
  'preferredMode',
  'consent',
] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];

export const ANSWER_FIELD_PREFIX = 'answers:';

/** Question keys become Mongo path segments, so keep them strictly safe. */
export const QUESTION_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Number of autosave receipts retained per draft for retry de-duplication. */
export const SAVE_RECEIPT_LIMIT = 50;

/** Optimistic-concurrency retries before surfacing a conflict. */
export const MAX_SAVE_ATTEMPTS = 3;

export const IDEMPOTENCY_HEADER = 'idempotency-key';
