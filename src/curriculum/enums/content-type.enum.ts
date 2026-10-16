/**
 * Content types a lesson content unit can carry.
 *
 * The enum is the single source of truth shared by the Mongoose schemas, the
 * DTO validators and the API documentation, so a payload that validates at the
 * edge is always storable.
 */
export enum ContentUnitType {
  VIDEO = 'video',
  ARTICLE = 'article',
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  FILE = 'file',
  LINK = 'link',
}

export const CONTENT_UNIT_TYPES = Object.values(ContentUnitType);

/** Content unit types whose payload must carry a resolvable `url`. */
export const URL_BACKED_CONTENT_TYPES: ReadonlySet<ContentUnitType> = new Set([
  ContentUnitType.VIDEO,
  ContentUnitType.FILE,
  ContentUnitType.LINK,
]);

/** Content unit types whose payload must carry inline `body` text. */
export const BODY_BACKED_CONTENT_TYPES: ReadonlySet<ContentUnitType> = new Set([
  ContentUnitType.ARTICLE,
  ContentUnitType.QUIZ,
  ContentUnitType.ASSIGNMENT,
]);
