import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { NoteStatus } from '../schemas/project-note.schema';
import { ResourceStatus } from '../schemas/project-resource.schema';
import {
  WorkspaceRole,
  WorkspaceStatus,
} from '../schemas/project-workspace.schema';
import {
  assertNoteTransition,
  assertResourceTransition,
  assertWorkspaceTransition,
  assertVersion,
  isDuplicateKeyError,
  normalizeIdempotencyKey,
  requireMember,
} from './workspace-rules';

const workspace = (members: Array<{ userId: string; role: WorkspaceRole }>) =>
  ({ tenantId: 'tenant-1', members }) as never;

function codeOf(promise: Promise<unknown>): Promise<ErrorCode | undefined> {
  return promise.then(
    () => undefined,
    (error: unknown) => (error as DomainException).errorCode,
  );
}

describe('project workspace domain rules', () => {
  it('allows only documented workspace lifecycle transitions', () => {
    expect(() =>
      assertWorkspaceTransition(WorkspaceStatus.DRAFT, WorkspaceStatus.ACTIVE),
    ).not.toThrow();
    expect(() =>
      assertWorkspaceTransition(WorkspaceStatus.ACTIVE, WorkspaceStatus.DRAFT),
    ).toThrow('Invalid transition');
  });

  it('rejects stale or terminal transitions with stable error codes', async () => {
    expect(
      await codeOf(
        Promise.resolve().then(() =>
          assertWorkspaceTransition(
            WorkspaceStatus.ARCHIVED,
            WorkspaceStatus.ACTIVE,
          ),
        ),
      ),
    ).toBe(ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION);

    expect(
      await codeOf(
        Promise.resolve().then(() =>
          assertNoteTransition(NoteStatus.ARCHIVED, NoteStatus.ARCHIVED),
        ),
      ),
    ).toBe(ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION);

    expect(
      await codeOf(
        Promise.resolve().then(() =>
          assertResourceTransition(
            ResourceStatus.APPROVED,
            ResourceStatus.PENDING,
          ),
        ),
      ),
    ).toBe(ErrorCode.BIZ_WORKSPACE_INVALID_TRANSITION);
  });

  it('denies access by default when no roles are declared', () => {
    const subject = workspace([{ userId: 'u1', role: WorkspaceRole.VIEWER }]);
    expect(() => requireMember(subject, 'u1', [])).toThrow();
    expect(() =>
      requireMember(subject, 'u1', [WorkspaceRole.EDITOR]),
    ).toThrow();
    expect(() =>
      requireMember(subject, 'u1', [WorkspaceRole.VIEWER]),
    ).not.toThrow();
    expect(() =>
      requireMember(subject, 'u2', [WorkspaceRole.VIEWER]),
    ).toThrow();
  });

  it('reports optimistic lock conflicts with expected and actual versions', async () => {
    expect(
      await codeOf(Promise.resolve().then(() => assertVersion(2, 5))),
    ).toBe(ErrorCode.BIZ_WORKSPACE_STALE_VERSION);
    expect(() => assertVersion(3, 3)).not.toThrow();
  });

  it('normalizes and validates idempotency keys', () => {
    expect(normalizeIdempotencyKey()).toBeNull();
    expect(normalizeIdempotencyKey('create-1')).toBe('create-1');
    expect(() => normalizeIdempotencyKey('bad key')).toThrow();
  });

  it('recognizes duplicate key errors for replay handling', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError(new Error('other'))).toBe(false);
  });
});
