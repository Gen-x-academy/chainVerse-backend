import { createHmac, timingSafeEqual } from 'crypto';

export const WORKSPACE_ERRORS = {
  TENANT_FORBIDDEN: 'CAPSTONE_WORKSPACE_TENANT_FORBIDDEN',
  MEMBER_FORBIDDEN: 'CAPSTONE_WORKSPACE_MEMBER_FORBIDDEN',
  ROLE_FORBIDDEN: 'CAPSTONE_WORKSPACE_ROLE_FORBIDDEN',
  NOT_FOUND: 'CAPSTONE_WORKSPACE_NOT_FOUND',
  INVALID_INPUT: 'CAPSTONE_WORKSPACE_INVALID_INPUT',
  STALE_TRANSITION: 'CAPSTONE_WORKSPACE_STALE_TRANSITION',
  IDEMPOTENCY_CONFLICT: 'CAPSTONE_WORKSPACE_IDEMPOTENCY_CONFLICT',
  WEBHOOK_SIGNATURE_INVALID: 'CAPSTONE_WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_REPLAY: 'CAPSTONE_WEBHOOK_REPLAY',
  CONNECTION_REVOKED: 'CAPSTONE_PROVIDER_CONNECTION_REVOKED',
} as const;

export const WORKSPACE_CAPSTONE_ITEMS = [
  { id: 69, key: 'CAPSTONE-069', name: 'Add project discussion threads' },
  { id: 70, key: 'CAPSTONE-070', name: 'Record project decisions' },
  { id: 71, key: 'CAPSTONE-071', name: 'Integrate source-control references' },
  { id: 72, key: 'CAPSTONE-072', name: 'Generate project activity feed' },
] as const;

export type WorkspaceRole = 'owner' | 'maintainer' | 'member' | 'viewer';

export interface WorkspaceMembership {
  userId: string;
  tenantId: string;
  projectId: string;
  role: WorkspaceRole;
  status: 'active' | 'suspended' | 'removed';
}

export interface WorkspaceContext {
  tenantId: string;
  projectId: string;
  actorId: string;
  memberships: WorkspaceMembership[];
  now?: Date;
}

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  maintainer: 2,
  owner: 3,
};

function fail(code: string): never {
  throw new Error(code);
}

function requireText(value: string | undefined | null, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:${field}`);
  }
  return value.trim();
}

function requireBounded(
  value: string | undefined,
  field: string,
  min: number,
  max: number,
): string {
  const text = requireText(value, field);
  if (text.length < min || text.length > max) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:${field}`);
  }
  return text;
}

function sameWorkspace(
  row: { tenantId: string; projectId: string },
  ctx: WorkspaceContext,
): boolean {
  return row.tenantId === ctx.tenantId && row.projectId === ctx.projectId;
}

function requireSameWorkspace(
  row: { tenantId: string; projectId: string },
  ctx: WorkspaceContext,
): void {
  if (!sameWorkspace(row, ctx)) fail(WORKSPACE_ERRORS.TENANT_FORBIDDEN);
}

function timestamp(ctx: WorkspaceContext): string {
  return (ctx.now ?? new Date()).toISOString();
}

export function assertSameTenant(left: string, right: string): void {
  if (requireText(left, 'tenantId') !== requireText(right, 'tenantId')) {
    fail(WORKSPACE_ERRORS.TENANT_FORBIDDEN);
  }
}

export function assertWorkspaceAccess(
  ctx: WorkspaceContext,
  minimum: WorkspaceRole = 'viewer',
): WorkspaceMembership {
  requireText(ctx.tenantId, 'tenantId');
  requireText(ctx.projectId, 'projectId');
  requireText(ctx.actorId, 'actorId');
  const membership = ctx.memberships.find(
    (row) =>
      row.tenantId === ctx.tenantId &&
      row.projectId === ctx.projectId &&
      row.userId === ctx.actorId &&
      row.status === 'active',
  );
  if (!membership) {
    const crossTenant = ctx.memberships.some(
      (row) =>
        row.projectId === ctx.projectId &&
        row.userId === ctx.actorId &&
        row.tenantId !== ctx.tenantId &&
        row.status === 'active',
    );
    fail(
      crossTenant
        ? WORKSPACE_ERRORS.TENANT_FORBIDDEN
        : WORKSPACE_ERRORS.MEMBER_FORBIDDEN,
    );
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minimum]) {
    fail(WORKSPACE_ERRORS.ROLE_FORBIDDEN);
  }
  return membership;
}

function isActiveMember(ctx: WorkspaceContext, userId: string): boolean {
  return ctx.memberships.some(
    (row) =>
      row.tenantId === ctx.tenantId &&
      row.projectId === ctx.projectId &&
      row.userId === userId &&
      row.status === 'active',
  );
}

function requireMembers(ctx: WorkspaceContext, userIds: string[]): string[] {
  const unique = [...new Set(userIds.map((id) => requireText(id, 'userId')))];
  if (unique.some((id) => !isActiveMember(ctx, id))) {
    fail(WORKSPACE_ERRORS.MEMBER_FORBIDDEN);
  }
  return unique;
}

function assertTransition<T extends string>(
  from: T,
  to: T,
  transitions: Record<T, readonly T[]>,
): void {
  if (from === to) return;
  if (!transitions[from]?.includes(to)) fail(WORKSPACE_ERRORS.STALE_TRANSITION);
}

function sanitizeAuditRefs(refs: string[], addition: string): string[] {
  return [...new Set([...refs.filter((ref) => ref.length <= 128), addition])];
}

export const THREAD_STATES = [
  'open',
  'resolved',
  'locked',
  'archived',
] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

const THREAD_TRANSITIONS: Record<ThreadState, readonly ThreadState[]> = {
  open: ['resolved', 'locked', 'archived'],
  resolved: ['open', 'locked', 'archived'],
  locked: ['open', 'archived'],
  archived: [],
};

export type ThreadVisibility = 'project' | 'mentors' | 'private';
export type PostModerationState = 'visible' | 'hidden' | 'removed';

export interface DiscussionAttachment {
  attachmentId: string;
  fileName: string;
  mediaType: string;
  byteSize: number;
  storageKey: string;
}

export interface DiscussionPost {
  sequence: number;
  authorId: string;
  body: string;
  createdAt: string;
  mentions: string[];
  attachments: DiscussionAttachment[];
  moderationState: PostModerationState;
  idempotencyKey: string;
}

export interface DiscussionThread {
  threadId: string;
  tenantId: string;
  projectId: string;
  title: string;
  topic: string;
  visibility: ThreadVisibility;
  allowedUserIds: string[];
  state: ThreadState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  retentionDays: number;
  posts: DiscussionPost[];
  idempotencyKey: string;
  auditRefs: string[];
}

export interface CreateDiscussionThreadInput {
  threadId: string;
  idempotencyKey: string;
  title: string;
  topic: string;
  visibility?: ThreadVisibility;
  allowedUserIds?: string[];
  retentionDays?: number;
}

function sanitizeAttachment(
  ctx: WorkspaceContext,
  value: DiscussionAttachment,
): DiscussionAttachment {
  const attachmentId = requireText(value?.attachmentId, 'attachmentId');
  const fileName = requireBounded(value?.fileName, 'fileName', 1, 255);
  const mediaType = requireBounded(value?.mediaType, 'mediaType', 1, 127);
  const byteSize = Number(value?.byteSize);
  const storageKey = requireBounded(value?.storageKey, 'storageKey', 1, 512);
  if (
    !Number.isInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > 50 * 1024 * 1024
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:byteSize`);
  }
  if (!storageKey.startsWith(`projects/${ctx.projectId}/attachments/`)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:storageKey`);
  }
  return { attachmentId, fileName, mediaType, byteSize, storageKey };
}

function extractMentions(body: string): string[] {
  const matches: RegExpMatchArray | null = body.match(/@[A-Za-z0-9_-]{2,64}/g);
  return [...new Set((matches ?? []).map((match: string) => match.slice(1)))];
}

function canViewThread(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
): boolean {
  if (thread.visibility === 'project') return true;
  if (thread.visibility === 'private') {
    return (
      thread.allowedUserIds.includes(ctx.actorId) ||
      thread.createdBy === ctx.actorId
    );
  }
  const role = ctx.memberships.find(
    (row) =>
      row.tenantId === ctx.tenantId &&
      row.projectId === ctx.projectId &&
      row.userId === ctx.actorId &&
      row.status === 'active',
  )?.role;
  return role === 'owner' || role === 'maintainer';
}

function requireVisibleThread(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
): void {
  requireSameWorkspace(thread, ctx);
  if (!canViewThread(ctx, thread)) fail(WORKSPACE_ERRORS.MEMBER_FORBIDDEN);
}

export function createDiscussionThread(
  ctx: WorkspaceContext,
  threads: DiscussionThread[],
  input: CreateDiscussionThreadInput,
): { threads: DiscussionThread[]; thread: DiscussionThread } {
  assertWorkspaceAccess(ctx, 'member');
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = threads.find(
    (thread) =>
      sameWorkspace(thread, ctx) && thread.idempotencyKey === idempotencyKey,
  );
  if (existing) return { threads, thread: existing };

  const threadId = requireText(input?.threadId, 'threadId');
  if (threads.some((thread) => thread.threadId === threadId)) {
    fail(WORKSPACE_ERRORS.IDEMPOTENCY_CONFLICT);
  }
  const visibility = input.visibility ?? 'project';
  if (!['project', 'mentors', 'private'].includes(visibility)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:visibility`);
  }
  const retentionDays = input.retentionDays ?? 90;
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 7 ||
    retentionDays > 730
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:retentionDays`);
  }
  const allowedUserIds =
    visibility === 'private'
      ? requireMembers(ctx, [...(input.allowedUserIds ?? []), ctx.actorId])
      : [];
  const now = timestamp(ctx);
  const thread: DiscussionThread = {
    threadId,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    title: requireBounded(input.title, 'title', 1, 140),
    topic: requireBounded(input.topic, 'topic', 1, 1000),
    visibility,
    allowedUserIds,
    state: 'open',
    createdBy: ctx.actorId,
    createdAt: now,
    updatedAt: now,
    retentionDays,
    posts: [],
    idempotencyKey,
    auditRefs: [`thread:${threadId}:created`],
  };
  return { threads: [...threads, thread], thread };
}

export interface AppendDiscussionPostInput {
  idempotencyKey: string;
  body: string;
  mentions?: string[];
  attachments?: DiscussionAttachment[];
}

export function appendDiscussionPost(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
  input: AppendDiscussionPostInput,
): { thread: DiscussionThread; post: DiscussionPost } {
  assertWorkspaceAccess(ctx, 'member');
  requireVisibleThread(ctx, thread);
  if (thread.state !== 'open') fail(WORKSPACE_ERRORS.STALE_TRANSITION);
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = thread.posts.find(
    (post) => post.idempotencyKey === idempotencyKey,
  );
  if (existing) return { thread, post: existing };

  const body = requireBounded(input?.body, 'body', 1, 4000);
  const mentions = requireMembers(ctx, [
    ...extractMentions(body),
    ...(input.mentions ?? []),
  ]);
  const attachments = (input.attachments ?? []).map((attachment) =>
    sanitizeAttachment(ctx, attachment),
  );
  if (attachments.length > 10) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:attachments`);
  }
  const post: DiscussionPost = {
    sequence:
      thread.posts.reduce((max, row) => Math.max(max, row.sequence), 0) + 1,
    authorId: ctx.actorId,
    body,
    createdAt: timestamp(ctx),
    mentions,
    attachments,
    moderationState: 'visible',
    idempotencyKey,
  };
  return {
    thread: {
      ...thread,
      posts: [...thread.posts, post],
      updatedAt: post.createdAt,
      auditRefs: sanitizeAuditRefs(
        thread.auditRefs,
        `thread:${thread.threadId}:posted`,
      ),
    },
    post,
  };
}

export function transitionThread(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
  to: ThreadState,
): DiscussionThread {
  assertWorkspaceAccess(ctx, 'maintainer');
  requireVisibleThread(ctx, thread);
  if (!THREAD_STATES.includes(to))
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:state`);
  assertTransition(thread.state, to, THREAD_TRANSITIONS);
  if (thread.state === to) return thread;
  return {
    ...thread,
    state: to,
    updatedAt: timestamp(ctx),
    auditRefs: sanitizeAuditRefs(
      thread.auditRefs,
      `thread:${thread.threadId}:${to}`,
    ),
  };
}

export function moderateDiscussionPost(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
  sequence: number,
  state: PostModerationState,
): DiscussionThread {
  assertWorkspaceAccess(ctx, 'maintainer');
  requireVisibleThread(ctx, thread);
  if (!['visible', 'hidden', 'removed'].includes(state)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:moderationState`);
  }
  const index = thread.posts.findIndex((post) => post.sequence === sequence);
  if (index < 0) fail(WORKSPACE_ERRORS.NOT_FOUND);
  const posts = thread.posts.map((post, position) =>
    position === index ? { ...post, moderationState: state } : post,
  );
  return {
    ...thread,
    posts,
    updatedAt: timestamp(ctx),
    auditRefs: sanitizeAuditRefs(
      thread.auditRefs,
      `post:${thread.threadId}:${sequence}:${state}`,
    ),
  };
}

export function visibleDiscussionPosts(
  ctx: WorkspaceContext,
  thread: DiscussionThread,
): DiscussionPost[] {
  assertWorkspaceAccess(ctx);
  requireVisibleThread(ctx, thread);
  const canModerate =
    ROLE_RANK[assertWorkspaceAccess(ctx).role] >= ROLE_RANK.maintainer;
  return thread.posts.filter(
    (post) => post.moderationState === 'visible' || canModerate,
  );
}

export function expireDiscussionThreads(
  threads: DiscussionThread[],
  now: Date = new Date(),
): DiscussionThread[] {
  return threads.filter((thread) => {
    const expires =
      new Date(thread.createdAt).getTime() +
      thread.retentionDays * 24 * 60 * 60 * 1000;
    return Number.isFinite(expires) && expires > now.getTime();
  });
}

export const DECISION_STATES = [
  'draft',
  'approved',
  'superseded',
  'rejected',
] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export interface ProjectDecision {
  decisionId: string;
  tenantId: string;
  projectId: string;
  statement: string;
  context: string;
  alternatives: string[];
  approvers: string[];
  approvals: string[];
  status: DecisionState;
  effectiveDate: string;
  evidenceRefs: string[];
  supersedes: string | null;
  supersededBy: string | null;
  createdBy: string;
  createdAt: string;
  idempotencyKey: string;
  auditRefs: string[];
}

export interface RecordDecisionInput {
  decisionId: string;
  idempotencyKey: string;
  statement: string;
  context: string;
  alternatives?: string[];
  approvers: string[];
  effectiveDate: string;
  evidenceRefs?: string[];
  supersedes?: string | null;
}

function requireDecision(
  ctx: WorkspaceContext,
  decisions: ProjectDecision[],
  decisionId: string,
): ProjectDecision {
  const decision = decisions.find(
    (row) => row.decisionId === decisionId && sameWorkspace(row, ctx),
  );
  if (!decision) fail(WORKSPACE_ERRORS.NOT_FOUND);
  return decision;
}

export function recordProjectDecision(
  ctx: WorkspaceContext,
  decisions: ProjectDecision[],
  input: RecordDecisionInput,
): { decisions: ProjectDecision[]; decision: ProjectDecision } {
  assertWorkspaceAccess(ctx, 'maintainer');
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = decisions.find(
    (decision) =>
      sameWorkspace(decision, ctx) &&
      decision.idempotencyKey === idempotencyKey,
  );
  if (existing) return { decisions, decision: existing };

  const decisionId = requireText(input?.decisionId, 'decisionId');
  if (decisions.some((decision) => decision.decisionId === decisionId)) {
    fail(WORKSPACE_ERRORS.IDEMPOTENCY_CONFLICT);
  }
  const approvers = requireMembers(ctx, input?.approvers ?? []);
  if (approvers.length === 0)
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:approvers`);
  const alternatives = (input.alternatives ?? []).map((value) =>
    requireBounded(value, 'alternatives', 1, 500),
  );
  if (alternatives.length > 10)
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:alternatives`);
  const evidenceRefs = [
    ...new Set(
      (input.evidenceRefs ?? []).map((ref) => requireText(ref, 'evidenceRefs')),
    ),
  ];
  if (evidenceRefs.length > 25)
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:evidenceRefs`);
  const effectiveDate = requireText(input.effectiveDate, 'effectiveDate');
  if (Number.isNaN(Date.parse(effectiveDate))) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:effectiveDate`);
  }

  let supersedes: string | null = null;
  if (input.supersedes) {
    const previous = requireDecision(ctx, decisions, input.supersedes);
    if (previous.status !== 'approved' || previous.supersededBy) {
      fail(WORKSPACE_ERRORS.STALE_TRANSITION);
    }
    supersedes = previous.decisionId;
  }

  const decision: ProjectDecision = {
    decisionId,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    statement: requireBounded(input.statement, 'statement', 1, 500),
    context: requireBounded(input.context, 'context', 1, 2000),
    alternatives,
    approvers,
    approvals: [],
    status: 'draft',
    effectiveDate: new Date(effectiveDate).toISOString(),
    evidenceRefs,
    supersedes,
    supersededBy: null,
    createdBy: ctx.actorId,
    createdAt: timestamp(ctx),
    idempotencyKey,
    auditRefs: [`decision:${decisionId}:created`],
  };
  return { decisions: [...decisions, decision], decision };
}

export function approveProjectDecision(
  ctx: WorkspaceContext,
  decisions: ProjectDecision[],
  decisionId: string,
): { decisions: ProjectDecision[]; decision: ProjectDecision } {
  assertWorkspaceAccess(ctx);
  const current = requireDecision(ctx, decisions, decisionId);
  if (current.status !== 'draft') fail(WORKSPACE_ERRORS.STALE_TRANSITION);
  if (!current.approvers.includes(ctx.actorId))
    fail(WORKSPACE_ERRORS.MEMBER_FORBIDDEN);

  const approvals = [...new Set([...current.approvals, ctx.actorId])];
  const status: DecisionState =
    approvals.length === current.approvers.length ? 'approved' : 'draft';
  const approved: ProjectDecision = {
    ...current,
    approvals,
    status,
    auditRefs: sanitizeAuditRefs(
      current.auditRefs,
      `decision:${decisionId}:approved`,
    ),
  };
  const next = decisions.map((decision) => {
    if (decision.decisionId === decisionId) return approved;
    if (
      approved.status === 'approved' &&
      decision.decisionId === approved.supersedes
    ) {
      return {
        ...decision,
        status: 'superseded' as const,
        supersededBy: approved.decisionId,
        auditRefs: sanitizeAuditRefs(
          decision.auditRefs,
          `decision:${decision.decisionId}:superseded`,
        ),
      };
    }
    return decision;
  });
  return { decisions: next, decision: approved };
}

export function rejectProjectDecision(
  ctx: WorkspaceContext,
  decisions: ProjectDecision[],
  decisionId: string,
): { decisions: ProjectDecision[]; decision: ProjectDecision } {
  assertWorkspaceAccess(ctx, 'maintainer');
  const current = requireDecision(ctx, decisions, decisionId);
  if (current.status !== 'draft') fail(WORKSPACE_ERRORS.STALE_TRANSITION);
  const rejected: ProjectDecision = {
    ...current,
    status: 'rejected',
    auditRefs: sanitizeAuditRefs(
      current.auditRefs,
      `decision:${decisionId}:rejected`,
    ),
  };
  return {
    decisions: decisions.map((decision) =>
      decision.decisionId === decisionId ? rejected : decision,
    ),
    decision: rejected,
  };
}

export function visibleDecisions(
  ctx: WorkspaceContext,
  decisions: ProjectDecision[],
): ProjectDecision[] {
  assertWorkspaceAccess(ctx);
  return decisions
    .filter(
      (decision) =>
        sameWorkspace(decision, ctx) && decision.status !== 'rejected',
    )
    .sort((a, b) => Date.parse(b.effectiveDate) - Date.parse(a.effectiveDate));
}

export type ProviderKind = 'github' | 'gitlab' | 'bitbucket';

export interface ProviderConnection {
  connectionId: string;
  tenantId: string;
  projectId: string;
  provider: ProviderKind;
  externalAccountId: string;
  scopes: string[];
  tokenRef: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string;
  idempotencyKey: string;
  auditRefs: string[];
}

export interface ConnectProviderInput {
  connectionId: string;
  idempotencyKey: string;
  provider: ProviderKind;
  externalAccountId: string;
  scopes: string[];
  tokenRef: string;
  expiresAt: string;
}

const ALLOWED_PROVIDER_SCOPES = [
  'repo:read',
  'webhook:read',
  'commit:read',
  'release:read',
];

function assertNoRawSecrets(value: unknown): void {
  const forbidden = [
    'token',
    'secret',
    'password',
    'authorization',
    'cookie',
    'privateKey',
  ];
  if (typeof value !== 'object' || value === null) return;
  if (forbidden.some((key) => key in (value as Record<string, unknown>))) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:credentials`);
  }
}

export function connectProvider(
  ctx: WorkspaceContext,
  connections: ProviderConnection[],
  input: ConnectProviderInput,
): { connections: ProviderConnection[]; connection: ProviderConnection } {
  assertWorkspaceAccess(ctx, 'maintainer');
  assertNoRawSecrets(input);
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = connections.find(
    (connection) =>
      sameWorkspace(connection, ctx) &&
      connection.idempotencyKey === idempotencyKey,
  );
  if (existing) return { connections, connection: existing };

  const connectionId = requireText(input?.connectionId, 'connectionId');
  if (
    connections.some((connection) => connection.connectionId === connectionId)
  ) {
    fail(WORKSPACE_ERRORS.IDEMPOTENCY_CONFLICT);
  }
  if (!['github', 'gitlab', 'bitbucket'].includes(input?.provider)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:provider`);
  }
  const scopes = [...new Set(input.scopes ?? [])];
  if (
    scopes.length === 0 ||
    scopes.some((scope) => !ALLOWED_PROVIDER_SCOPES.includes(scope))
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:scopes`);
  }
  const tokenRef = requireText(input.tokenRef, 'tokenRef');
  if (!/^vault:[A-Za-z0-9._-]{3,128}$/.test(tokenRef)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:tokenRef`);
  }
  const expiresAt = new Date(requireText(input.expiresAt, 'expiresAt'));
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= (ctx.now ?? new Date()).getTime()
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:expiresAt`);
  }
  const connection: ProviderConnection = {
    connectionId,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    provider: input.provider,
    externalAccountId: requireText(
      input.externalAccountId,
      'externalAccountId',
    ),
    scopes,
    tokenRef,
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    createdBy: ctx.actorId,
    idempotencyKey,
    auditRefs: [`provider:${connectionId}:connected`],
  };
  return { connections: [...connections, connection], connection };
}

export function revokeProviderConnection(
  ctx: WorkspaceContext,
  connections: ProviderConnection[],
  connectionId: string,
): { connections: ProviderConnection[]; connection: ProviderConnection } {
  assertWorkspaceAccess(ctx, 'maintainer');
  const current = connections.find(
    (connection) =>
      connection.connectionId === connectionId &&
      sameWorkspace(connection, ctx),
  );
  if (!current) fail(WORKSPACE_ERRORS.NOT_FOUND);
  if (current.revokedAt) return { connections, connection: current };
  const revoked: ProviderConnection = {
    ...current,
    revokedAt: timestamp(ctx),
    auditRefs: sanitizeAuditRefs(
      current.auditRefs,
      `provider:${connectionId}:revoked`,
    ),
  };
  return {
    connections: connections.map((connection) =>
      connection.connectionId === connectionId ? revoked : connection,
    ),
    connection: revoked,
  };
}

function requireActiveConnection(
  ctx: WorkspaceContext,
  connection: ProviderConnection,
): void {
  requireSameWorkspace(connection, ctx);
  if (connection.revokedAt) fail(WORKSPACE_ERRORS.CONNECTION_REVOKED);
  if (
    new Date(connection.expiresAt).getTime() <=
    (ctx.now ?? new Date()).getTime()
  ) {
    fail(WORKSPACE_ERRORS.CONNECTION_REVOKED);
  }
}

export type SourceReferenceKind =
  | 'repository'
  | 'branch'
  | 'commit'
  | 'release'
  | 'contribution';

export interface SourceReference {
  referenceId: string;
  tenantId: string;
  projectId: string;
  connectionId: string;
  kind: SourceReferenceKind;
  externalId: string;
  displayName: string;
  url: string | null;
  metadata: Record<string, string | number | boolean | null>;
  recordedBy: string;
  recordedAt: string;
  idempotencyKey: string;
  auditRefs: string[];
}

export interface SourceReferenceInput {
  referenceId: string;
  idempotencyKey: string;
  connectionId: string;
  kind: SourceReferenceKind;
  externalId: string;
  displayName: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_METADATA_KEYS = [
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
  'privateKey',
  'api_key',
  'apikey',
  'email',
  'phone',
];

export function sanitizeSourceMetadata(
  metadata: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  Object.entries(metadata).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (
      SENSITIVE_METADATA_KEYS.some((sensitive) =>
        lower.includes(sensitive.toLowerCase()),
      )
    ) {
      return;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      if (String(value).length <= 500) clean[key] = value;
    }
  });
  return clean;
}

export function linkSourceReference(
  ctx: WorkspaceContext,
  connection: ProviderConnection,
  references: SourceReference[],
  input: SourceReferenceInput,
): { references: SourceReference[]; reference: SourceReference } {
  assertWorkspaceAccess(ctx, 'member');
  requireActiveConnection(ctx, connection);
  assertNoRawSecrets(input);
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = references.find(
    (reference) =>
      sameWorkspace(reference, ctx) &&
      reference.connectionId === connection.connectionId &&
      reference.idempotencyKey === idempotencyKey,
  );
  if (existing) return { references, reference: existing };

  const referenceId = requireText(input?.referenceId, 'referenceId');
  if (references.some((reference) => reference.referenceId === referenceId)) {
    fail(WORKSPACE_ERRORS.IDEMPOTENCY_CONFLICT);
  }
  if (
    !['repository', 'branch', 'commit', 'release', 'contribution'].includes(
      input?.kind,
    )
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:kind`);
  }
  let url: string | null = null;
  if (input.url) {
    const candidate = requireText(input.url, 'url');
    if (!candidate.startsWith('https://'))
      fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:url`);
    url = candidate;
  }
  const reference: SourceReference = {
    referenceId,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    connectionId: connection.connectionId,
    kind: input.kind,
    externalId: requireText(input.externalId, 'externalId'),
    displayName: requireBounded(input.displayName, 'displayName', 1, 200),
    url,
    metadata: sanitizeSourceMetadata(input.metadata ?? {}),
    recordedBy: ctx.actorId,
    recordedAt: timestamp(ctx),
    idempotencyKey,
    auditRefs: [`source:${referenceId}:${input.kind}`],
  };
  return { references: [...references, reference], reference };
}

export interface ProviderWebhookEvent {
  eventId: string;
  type: 'commit' | 'release' | 'contribution';
  externalId: string;
  displayName: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
}

export function verifyProviderWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  timestampSeconds: string | number,
  now: Date = new Date(),
  toleranceMs = 300000,
): true {
  const providedHex = requireText(signatureHeader, 'signatureHeader').replace(
    /^sha256=/,
    '',
  );
  if (!/^[0-9a-f]{64}$/i.test(providedHex))
    fail(WORKSPACE_ERRORS.WEBHOOK_SIGNATURE_INVALID);
  const expected = createHmac('sha256', requireText(secret, 'secret'))
    .update(rawBody)
    .digest();
  const provided = Buffer.from(providedHex, 'hex');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    fail(WORKSPACE_ERRORS.WEBHOOK_SIGNATURE_INVALID);
  }
  const seconds = Number(timestampSeconds);
  if (
    !Number.isFinite(seconds) ||
    Math.abs(now.getTime() - seconds * 1000) > toleranceMs
  ) {
    fail(WORKSPACE_ERRORS.WEBHOOK_REPLAY);
  }
  return true;
}

export function mapProviderWebhook(
  ctx: WorkspaceContext,
  connection: ProviderConnection,
  references: SourceReference[],
  event: ProviderWebhookEvent,
): { references: SourceReference[]; reference: SourceReference } {
  assertWorkspaceAccess(ctx, 'member');
  requireActiveConnection(ctx, connection);
  assertNoRawSecrets(event);
  if (!['commit', 'release', 'contribution'].includes(event?.type)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:eventType`);
  }
  return linkSourceReference(ctx, connection, references, {
    referenceId: requireText(event.eventId, 'eventId'),
    idempotencyKey: `webhook:${connection.connectionId}:${requireText(event.eventId, 'eventId')}`,
    connectionId: connection.connectionId,
    kind: event.type,
    externalId: requireText(event.externalId, 'externalId'),
    displayName: requireBounded(event.displayName, 'displayName', 1, 200),
    url: event.url ?? null,
    metadata: event.metadata ?? {},
  });
}

export const ACTIVITY_TYPES = [
  'thread_created',
  'post_added',
  'decision_recorded',
  'decision_approved',
  'source_linked',
  'release_published',
  'contribution_recorded',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivityVisibility = 'project' | 'private';

export interface ActivityEvent {
  eventId: string;
  sequence: number;
  tenantId: string;
  projectId: string;
  actorId: string;
  type: ActivityType;
  occurredAt: string;
  summary: string;
  deepLink: string;
  visibility: ActivityVisibility;
  allowedUserIds: string[];
  readBy: string[];
  idempotencyKey: string;
  auditRef: string;
}

export interface BuildActivityEventInput {
  eventId: string;
  idempotencyKey: string;
  type: ActivityType;
  summary: string;
  deepLink: string;
  visibility?: ActivityVisibility;
  allowedUserIds?: string[];
}

function redactSensitiveText(value: string): string {
  return value.replace(
    /\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*\S+/gi,
    '$1=[redacted]',
  );
}

function assertSafeDeepLink(link: string, projectId: string): string {
  const value = requireBounded(link, 'deepLink', 1, 500);
  const prefix = `/projects/${projectId}/`;
  if (
    !value.startsWith(prefix) ||
    value.includes('..') ||
    value.includes('//')
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:deepLink`);
  }
  return value;
}

export function buildActivityEvent(
  ctx: WorkspaceContext,
  events: ActivityEvent[],
  input: BuildActivityEventInput,
): { events: ActivityEvent[]; event: ActivityEvent } {
  assertWorkspaceAccess(ctx, 'member');
  const idempotencyKey = requireText(input?.idempotencyKey, 'idempotencyKey');
  const existing = events.find(
    (event) =>
      sameWorkspace(event, ctx) && event.idempotencyKey === idempotencyKey,
  );
  if (existing) return { events, event: existing };

  const eventId = requireText(input?.eventId, 'eventId');
  if (events.some((event) => event.eventId === eventId)) {
    fail(WORKSPACE_ERRORS.IDEMPOTENCY_CONFLICT);
  }
  if (!ACTIVITY_TYPES.includes(input?.type))
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:type`);
  const visibility = input.visibility ?? 'project';
  if (!['project', 'private'].includes(visibility)) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:visibility`);
  }
  const allowedUserIds =
    visibility === 'private'
      ? requireMembers(ctx, [...(input.allowedUserIds ?? []), ctx.actorId])
      : [];
  const event: ActivityEvent = {
    eventId,
    sequence: events.reduce((max, row) => Math.max(max, row.sequence), 0) + 1,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    type: input.type,
    occurredAt: timestamp(ctx),
    summary: redactSensitiveText(
      requireBounded(input.summary, 'summary', 1, 280),
    ),
    deepLink: assertSafeDeepLink(input.deepLink, ctx.projectId),
    visibility,
    allowedUserIds,
    readBy: [ctx.actorId],
    idempotencyKey,
    auditRef: `activity:${eventId}`,
  };
  return { events: [...events, event], event };
}

function canViewActivity(ctx: WorkspaceContext, event: ActivityEvent): boolean {
  return (
    event.visibility === 'project' ||
    event.actorId === ctx.actorId ||
    event.allowedUserIds.includes(ctx.actorId)
  );
}

export function listActivityFeed(
  ctx: WorkspaceContext,
  events: ActivityEvent[],
  page: { before?: number; limit?: number } = {},
): {
  entries: Array<ActivityEvent & { unread: boolean }>;
  nextCursor: number | null;
  hasMore: boolean;
} {
  assertWorkspaceAccess(ctx);
  const limit = page.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:limit`);
  }
  if (
    page.before !== undefined &&
    (!Number.isInteger(page.before) || page.before < 1)
  ) {
    fail(`${WORKSPACE_ERRORS.INVALID_INPUT}:before`);
  }
  const filtered = events
    .filter(
      (event) =>
        sameWorkspace(event, ctx) &&
        canViewActivity(ctx, event) &&
        (page.before === undefined || event.sequence < page.before),
    )
    .sort((a, b) => b.sequence - a.sequence);
  const hasMore = filtered.length > limit;
  const rows = hasMore ? filtered.slice(0, limit) : filtered;
  return {
    entries: rows.map((event) => ({
      ...event,
      unread: !event.readBy.includes(ctx.actorId),
    })),
    nextCursor:
      hasMore && rows.length > 0 ? rows[rows.length - 1].sequence : null,
    hasMore,
  };
}

export function markActivityRead(
  ctx: WorkspaceContext,
  events: ActivityEvent[],
  eventId: string,
): { events: ActivityEvent[]; event: ActivityEvent } {
  assertWorkspaceAccess(ctx);
  const current = events.find(
    (event) => event.eventId === eventId && sameWorkspace(event, ctx),
  );
  if (!current || !canViewActivity(ctx, current))
    fail(WORKSPACE_ERRORS.NOT_FOUND);
  if (current.readBy.includes(ctx.actorId)) return { events, event: current };
  const updated: ActivityEvent = {
    ...current,
    readBy: [...current.readBy, ctx.actorId],
  };
  return {
    events: events.map((event) =>
      event.eventId === eventId ? updated : event,
    ),
    event: updated,
  };
}

export function expireActivityEvents(
  events: ActivityEvent[],
  now: Date = new Date(),
): ActivityEvent[] {
  return events.filter(
    (event) =>
      new Date(event.occurredAt).getTime() >
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
  );
}
