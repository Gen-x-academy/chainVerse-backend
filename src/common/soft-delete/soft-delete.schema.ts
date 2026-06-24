import { Schema } from 'mongoose';

export function applySoftDeleteSchema(schema: Schema): void {
  schema.index({ deletedAt: 1 });
  schema.pre('find', function () {
    this.where({ deletedAt: null });
  });
  schema.pre('findOne', function () {
    this.where({ deletedAt: null });
  });
  schema.pre('countDocuments', function () {
    this.where({ deletedAt: null });
  });
}
