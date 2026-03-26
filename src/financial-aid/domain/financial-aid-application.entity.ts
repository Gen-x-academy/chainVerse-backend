/**
 * Domain entity for a financial-aid application.
 *
 * Owns all business rules for what it means to be a financial-aid application:
 * the status lifecycle, the approval check, and the mutation surface.  Nothing
 * in this class knows about HTTP, databases, or NestJS — it is a plain object.
 */
export class FinancialAidApplication {
  constructor(
    public readonly id: string,
    public readonly studentId: string,
    public readonly courseId: string,
    public reason: string,
    public status: string,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /** Factory that encodes the "new application always starts as pending" rule. */
  static create(params: {
    id: string;
    studentId: string;
    courseId: string;
    reason: string;
  }): FinancialAidApplication {
    return new FinancialAidApplication(
      params.id,
      params.studentId,
      params.courseId,
      params.reason,
      'pending',
      new Date(),
      new Date(),
    );
  }

  isApproved(): boolean {
    return this.status === 'approved';
  }

  /** Apply a partial update.  Keeps updatedAt consistent with every mutation. */
  update(fields: { reason?: string; status?: string }): void {
    if (fields.reason !== undefined) this.reason = fields.reason;
    if (fields.status !== undefined) this.status = fields.status;
    this.updatedAt = new Date();
  }
}
