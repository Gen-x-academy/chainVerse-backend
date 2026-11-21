import { randomUUID } from 'crypto';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { NoteStatus } from '../schemas/project-note.schema';
import { ResourceStatus } from '../schemas/project-resource.schema';
import {
  ProjectWorkspace,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';

export const WORKSPACE_TRANSITIONS: Record<WorkspaceStatus, WorkspaceStatus[]> =
  {
    [WorkspaceStatus.DRAFT]: [WorkspaceStatus.ACTIVE, WorkspaceStatus.ARCHIVED],
    [WorkspaceStatus.ACTIVE]: [
      WorkspaceStatus.COMPLETED,
      WorkspaceStatus.ARCHIVED,
    ],
    [WorkspaceStatus.ON_HOLD]: [WorkspaceStatus.ARCHIVED],
    [WorkspaceStatus.COMPLETED]: [WorkspaceStatus.ARCHIVED],
    [WorkspaceStatus.ARCHIVED]: [],
  };

export const NOTE_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  [NoteStatus.DRAFT]: [NoteStatus.PUBLISHED, NoteStatus.ARCHIVED],
  [NoteStatus.PUBLISHED]: [NoteStatus.DRAFT, NoteStatus.ARCHIVED],
  [NoteStatus.ARCHIVED]: [NoteStatus.PUBLISHED],
};

export const RESOURCE_TRANSITIONS: Record<ResourceStatus, ResourceStatus[]> = {
  [ResourceStatus.PENDING]: [ResourceStatus.APPROVED, ResourceStatus.REJECTED],
  [ResourceStatus.REJECTED]: [ResourceStatus.PENDING, ResourceStatus.ARCHIVED],
  [ResourceStatus.APPROVED]: [ResourceStatus.ARCHIVED],
  [ResourceStatus.ARCHIVED]: [],
};

type TransitionMap<T extends string> = Record<T, T[]>;

function assertTransition<T extends string>(
  transitions: TransitionMap<T>,
  from: T,
  to: T,
  code: ErrorCode,
): void {
  const allowed = transitions[from] ?? [];
  if (from === to || !allowed.includes(to)) {
    throw new BusinessRuleException(
      `Invalid transition from ${from} to ${to}`,
      code,
      { from, to, allowed },
    );
  }
}

export function assertWorkspaceTransition(
  from: WorkspaceStatus,
  to: WorkspaceStatus,
): void {
  assertTransition(
    WORKSPACE_TRANSITIONS,
    from,
    to,
    ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
  );
}

export function assertNoteTransition(from: NoteStatus, to: NoteStatus): void {
  assertTransition(
    NOTE_TRANSITIONS,
    from,
    to,
    ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
  );
}

export function assertResourceTransition(
  from: ResourceStatus,
  to: ResourceStatus,
): void {
  assertTransition(
    RESOURCE_TRANSITIONS,
    from,
    to,
    ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION,
  );
}

/**
 * Deny-by-default membership check. No role declaration means no access:
 * callers must explicitly list every role allowed to perform an operation.
 */
export function requireMember(
  workspace: Pick<ProjectWorkspace, 'tenantId' | 'members'>,
  actorId: string,
  roles: WorkspaceRole[],
): WorkspaceMember {
  const member = (workspace.members ?? []).find(
    (candidate) => candidate.userId === actorId,
  );
  if (!member || !roles.includes(member.role)) {
    throw new ForbiddenDomainException(
      'Workspace access denied for this actor or role',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }
  return member;
}

export function assertTenant(
  workspace: Pick<ProjectWorkspace, 'tenantId'>,
  tenantId: string,
): void {
  if (!tenantId || workspace.tenantId !== tenantId) {
    throw new ForbiddenDomainException(
      'Resource belongs to a different tenant',
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }
}

export function assertNotArchived(
  workspace: Pick<ProjectWorkspace, 'status'>,
): void {
  if (workspace.status === WorkspaceStatus.ARCHIVED) {
    throw new BusinessRuleException(
      'Archived workspaces are immutable',
      ErrorCode.BIZ_WORKSPACE_ARCHIVED,
    );
  }
}

/** Rejects stale optimistic-lock writes before a database round trip. */
export function assertVersion(expected: number, actual: number): void {
  if (!Number.isInteger(expected) || expected !== actual) {
    throw new BusinessRuleException(
      `Expected version ${expected} but found ${actual}`,
      ErrorCode.BIZ_WORKSPACE_STALE_VERSION,
      { expected, actual },
    );
  }
}

export function normalizeIdempotencyKey(value?: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new ValidationDomainException(
      'idempotencyKey must be 1-128 characters of [A-Za-z0-9._:-]',
      ErrorCode.VAL_INVALID_FORMAT,
    );
  }
  return value;
}

export function assertLinkedNotesBelongToProject(
  note: { projectId: string; tenantId: string },
  linked: Array<{ projectId: string; tenantId: string }>,
): void {
  if (
    linked.some(
      (item) =>
        item.projectId !== note.projectId || item.tenantId !== note.tenantId,
    )
  ) {
    throw new ValidationDomainException(
      'Linked notes must belong to the same tenant and project',
      ErrorCode.VAL_INVALID_INPUT,
    );
  }
}

export function newEntryId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** MongoDB unique-index violation, used to resolve idempotent replay races. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
