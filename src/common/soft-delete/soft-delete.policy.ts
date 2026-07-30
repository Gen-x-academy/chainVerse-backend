const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const SOFT_DELETE_RETENTION_DAYS = {
  course: 90,
  badge: 90,
  financialAid: 365,
  subscriptionPlan: 180,
  organization: 180,
  organizationMember: 90,
  notification: 30,
  abuseReport: 365,
  pointsRecord: 365,
  removalRequest: 365,
  session: 14,
  savedCourse: 30,
  cartItem: 30,
  courseRating: 90,
} as const;

export type SoftDeleteEntity = keyof typeof SOFT_DELETE_RETENTION_DAYS;

export interface SoftDeleteFields {
  deletedAt?: Date | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
  restoreBy?: Date | null;
}

export function getSoftDeleteRetentionDays(entity: SoftDeleteEntity): number {
  return SOFT_DELETE_RETENTION_DAYS[entity];
}

export function buildSoftDeleteUpdate(
  entity: SoftDeleteEntity,
  deletionReason = 'manual_delete',
  deletedBy?: string,
) {
  const deletedAt = new Date();
  const retentionDays = getSoftDeleteRetentionDays(entity);
  const restoreBy = new Date(deletedAt.getTime() + retentionDays * DAY_IN_MS);

  return {
    $set: {
      deletedAt,
      restoreBy,
      deletionReason,
      deletedBy: deletedBy ?? null,
    },
  };
}

export function buildRestoreUpdate() {
  return {
    $set: {
      deletedAt: null,
      restoreBy: null,
      deletionReason: null,
      deletedBy: null,
    },
  };
}

export function canRestoreRecord(
  record: Pick<SoftDeleteFields, 'deletedAt' | 'restoreBy'>,
  now = new Date(),
): boolean {
  if (!record.deletedAt) {
    return false;
  }

  if (!record.restoreBy) {
    return false;
  }

  return record.restoreBy.getTime() >= now.getTime();
}
