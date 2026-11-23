/**
 * Block persistence is deliberately not duplicated: every writer shares the
 * canonical `mentorship_blocks` collection and its unique compound index on
 * `{ blockerId: 1, blockedId: 1 }`, which is what makes block creation
 * idempotent under concurrent retries. This module re-exports that schema so
 * its imports make the dependency explicit.
 */
export {
  MentorshipBlock,
  MentorshipBlockDocument,
  MentorshipBlockSchema,
} from '../../schemas/mentorship-block.schema';
