/**
 * Canonical list of privileged actions that must leave an audit trail.
 *
 * Values are namespaced `<domain>.<verb>` so log consumers can filter by
 * domain prefix without maintaining a second mapping.
 */
export enum AuditAction {
  // Course review / moderation (src/admin-course)
  COURSE_REVIEWED = 'course.reviewed',
  COURSE_PUBLISHED = 'course.published',
  COURSE_UNPUBLISHED = 'course.unpublished',
  COURSE_UPDATED = 'course.updated',
  COURSE_DELETED = 'course.deleted',

  // Financial aid decisions (src/admin-financial-aid-management)
  FINANCIAL_AID_CREATED = 'financial_aid.created',
  FINANCIAL_AID_UPDATED = 'financial_aid.updated',
  FINANCIAL_AID_DELETED = 'financial_aid.deleted',

  // Account administration (src/admin-auth)
  ADMIN_ACCOUNT_CREATED = 'admin_account.created',
  ADMIN_ACCOUNT_UPDATED = 'admin_account.updated',
  ADMIN_ACCOUNT_DELETED = 'admin_account.deleted',

  // Abuse report moderation (src/report-abuse)
  ABUSE_REPORT_UPDATED = 'abuse_report.updated',
  ABUSE_REPORT_DELETED = 'abuse_report.deleted',

  // Organization administration (src/organization, src/organization-member)
  ORGANIZATION_CREATED = 'organization.created',
  ORGANIZATION_UPDATED = 'organization.updated',
  ORGANIZATION_DELETED = 'organization.deleted',
  ORGANIZATION_MEMBER_ADDED = 'organization_member.added',
  ORGANIZATION_MEMBER_ROLE_CHANGED = 'organization_member.role_changed',
  ORGANIZATION_MEMBER_REMOVED = 'organization_member.removed',

  // Scholarship disbursements (src/scholarship-disbursement)
  SCHOLARSHIP_ASSET_PROPOSED = 'scholarship_asset.proposed',
  SCHOLARSHIP_ASSET_APPROVED = 'scholarship_asset.approved',
  SCHOLARSHIP_ASSET_DISABLED = 'scholarship_asset.disabled',
  PAYOUT_WALLET_VERIFIED = 'payout_wallet.verified',
  PAYOUT_WALLET_CHANGED = 'payout_wallet.changed',
  SCHOLARSHIP_PAYMENT_SCHEDULED = 'scholarship_payment.scheduled',
  SCHOLARSHIP_PAYMENT_CANCELLED = 'scholarship_payment.cancelled',
  SCHOLARSHIP_PAYMENT_HOLD_RELEASED = 'scholarship_payment.hold_released',
  SCHOLARSHIP_PAYMENT_RETRIED = 'scholarship_payment.retried',
  SCHOLARSHIP_PAYMENT_FINALIZED = 'scholarship_payment.finalized',
  SCHOLARSHIP_PAYMENT_REVERSED = 'scholarship_payment.reversed',
  SCHOLARSHIP_DISBURSEMENT_RUN = 'scholarship_disbursement.run',

  // Upload lifecycle (src/worker)
  FILE_UPLOAD_QUARANTINED = 'file_upload.quarantined',
  FILE_UPLOAD_SCANNED = 'file_upload.scanned',
  FILE_UPLOAD_RELEASED = 'file_upload.released',
  FILE_UPLOAD_REJECTED = 'file_upload.rejected',
  FILE_UPLOAD_DELETED = 'file_upload.deleted',
}

/**
 * Result of the audited attempt. `DENIED` records authorization failures,
 * which are as interesting to a reviewer as successful mutations.
 */
export enum AuditOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
  DENIED = 'denied',
}
