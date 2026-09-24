import { Query, Schema } from 'mongoose';

export class ImmutableFieldError extends Error {
  constructor(model: string, field: string) {
    super(`${model}.${field} is immutable once written`);
    this.name = 'ImmutableFieldError';
  }
}

const UPDATE_OPERATORS = [
  '$set',
  '$unset',
  '$inc',
  '$mul',
  '$rename',
  '$min',
  '$max',
  '$push',
  '$pull',
  '$addToSet',
  '$pop',
  '$currentDate',
  '$setOnInsert',
] as const;

function touchedFields(update: Record<string, unknown>): string[] {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('$')) {
      // $setOnInsert only applies when an upsert creates the document.
      if (key === '$setOnInsert') continue;
      if ((UPDATE_OPERATORS as readonly string[]).includes(key) && value) {
        fields.push(...Object.keys(value));
      }
    } else {
      fields.push(key);
    }
  }
  // `milestones.0.amountMinor` touches `milestones`.
  return fields.map((f) => f.split('.')[0]);
}

export interface ImmutableFieldsOptions {
  /**
   * Returns true when a query filter proves the target document is still
   * mutable (e.g. `{ status: 'draft' }`). Only consulted for query updates.
   */
  allowWhenFilter?: (filter: Record<string, unknown>) => boolean;
  /** Same escape hatch for `document.save()`. */
  allowWhenDocument?: (doc: Record<string, unknown>) => boolean;
}

/**
 * Defence in depth for financial fields: the services never rewrite them, and
 * this hook guarantees no future code path can either. Any update, replace or
 * re-save that touches a listed field throws before reaching MongoDB.
 */
export function applyImmutableFields(
  schema: Schema,
  modelName: string,
  fields: readonly string[],
  options: ImmutableFieldsOptions = {},
): void {
  const guarded = new Set(fields);

  schema.pre('save', function () {
    if (this.isNew) return;
    if (options.allowWhenDocument?.(this.toObject())) return;
    for (const field of guarded) {
      if (this.isModified(field))
        throw new ImmutableFieldError(modelName, field);
    }
  });

  const guardQuery = function (this: Query<unknown, unknown>) {
    if (options.allowWhenFilter?.(this.getFilter())) return;
    const update = this.getUpdate() as Record<string, unknown> | null;
    if (!update || Array.isArray(update)) {
      if (Array.isArray(update)) {
        throw new ImmutableFieldError(modelName, '<pipeline update>');
      }
      return;
    }
    for (const field of touchedFields(update)) {
      if (guarded.has(field)) throw new ImmutableFieldError(modelName, field);
    }
  };

  schema.pre('updateOne', guardQuery);
  schema.pre('updateMany', guardQuery);
  schema.pre('findOneAndUpdate', guardQuery);

  const rejectReplace = function () {
    throw new ImmutableFieldError(modelName, '<document replace>');
  };
  schema.pre('replaceOne', rejectReplace);
  schema.pre('findOneAndReplace', rejectReplace);
}
