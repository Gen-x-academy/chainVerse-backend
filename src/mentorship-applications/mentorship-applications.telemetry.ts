import { Injectable, Logger } from '@nestjs/common';

/**
 * Structured operational events for the mentorship application workflow.
 *
 * Privacy: only identifiers, revisions, counts and field *names* are logged –
 * never goals, answers, schedule or other mentee-entered content.
 */
@Injectable()
export class MentorshipApplicationsTelemetry {
  private readonly logger = new Logger('MentorshipApplications');

  draftCreated(applicationId: string, programId: string, replayed: boolean) {
    this.logger.log({
      event: 'mentorship.application.draft_created',
      applicationId,
      programId,
      replayed,
    });
  }

  draftSaved(
    applicationId: string,
    revision: number,
    fields: string[],
    attempts: number,
    replayed: boolean,
  ) {
    this.logger.log({
      event: 'mentorship.application.draft_saved',
      applicationId,
      revision,
      fieldCount: fields.length,
      attempts,
      replayed,
    });
  }

  draftConflict(
    applicationId: string,
    baseRevision: number,
    currentRevision: number,
    conflictingFields: string[],
  ) {
    this.logger.warn({
      event: 'mentorship.application.draft_conflict',
      applicationId,
      baseRevision,
      currentRevision,
      conflictingFields,
    });
  }

  draftRebased(applicationId: string, fromVersion: number, toVersion: number) {
    this.logger.log({
      event: 'mentorship.application.draft_rebased',
      applicationId,
      fromVersion,
      toVersion,
    });
  }

  draftDiscarded(applicationId: string) {
    this.logger.log({
      event: 'mentorship.application.draft_discarded',
      applicationId,
    });
  }

  submitted(applicationId: string, programId: string, replayed: boolean) {
    this.logger.log({
      event: 'mentorship.application.submitted',
      applicationId,
      programId,
      replayed,
    });
  }

  rejected(operation: string, errorCode: string, applicationId?: string) {
    this.logger.warn({
      event: 'mentorship.application.rejected',
      operation,
      errorCode,
      applicationId,
    });
  }

  formPublished(programId: string, version: number) {
    this.logger.log({
      event: 'mentorship.application_form.published',
      programId,
      version,
    });
  }
}
