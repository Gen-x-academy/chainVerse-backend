import { createHmac } from 'crypto';
import {
  ACTIVITY_TYPES,
  WORKSPACE_CAPSTONE_ITEMS,
  WORKSPACE_ERRORS,
  appendDiscussionPost,
  approveProjectDecision,
  assertSameTenant,
  assertWorkspaceAccess,
  buildActivityEvent,
  connectProvider,
  createDiscussionThread,
  expireActivityEvents,
  expireDiscussionThreads,
  linkSourceReference,
  listActivityFeed,
  mapProviderWebhook,
  markActivityRead,
  moderateDiscussionPost,
  recordProjectDecision,
  rejectProjectDecision,
  revokeProviderConnection,
  sanitizeSourceMetadata,
  visibleDecisions,
  visibleDiscussionPosts,
  verifyProviderWebhook,
  transitionThread,
  type ActivityEvent,
  type DiscussionAttachment,
  type DiscussionThread,
  type ProjectDecision,
  type ProviderConnection,
  type ProviderWebhookEvent,
  type SourceReference,
  type WorkspaceContext,
  type WorkspaceMembership,
} from './capstone-workspace';

const now = new Date('2026-11-20T12:00:00.000Z');

const memberships: WorkspaceMembership[] = [
  {
    userId: 'maintainer',
    tenantId: 't1',
    projectId: 'p1',
    role: 'maintainer',
    status: 'active',
  },
  {
    userId: 'member',
    tenantId: 't1',
    projectId: 'p1',
    role: 'member',
    status: 'active',
  },
  {
    userId: 'viewer',
    tenantId: 't1',
    projectId: 'p1',
    role: 'viewer',
    status: 'active',
  },
  {
    userId: 'outsider',
    tenantId: 't2',
    projectId: 'p1',
    role: 'member',
    status: 'active',
  },
];

const context = (actorId = 'maintainer'): WorkspaceContext => ({
  tenantId: 't1',
  projectId: 'p1',
  actorId,
  memberships,
  now,
});

describe('capstone workspace', () => {
  it('covers the four workspace capstones and activity types', () => {
    expect(WORKSPACE_CAPSTONE_ITEMS.map((item) => item.key)).toEqual([
      'CAPSTONE-069',
      'CAPSTONE-070',
      'CAPSTONE-071',
      'CAPSTONE-072',
    ]);
    expect(ACTIVITY_TYPES).toContain('thread_created');
    expect(ACTIVITY_TYPES).toContain('contribution_recorded');
  });

  it('denies cross-tenant and under-privileged access', () => {
    expect(() => assertWorkspaceAccess(context('outsider'))).toThrow(
      WORKSPACE_ERRORS.TENANT_FORBIDDEN,
    );
    expect(() =>
      assertWorkspaceAccess(context('viewer'), 'maintainer'),
    ).toThrow(WORKSPACE_ERRORS.ROLE_FORBIDDEN);
    expect(() => assertSameTenant('t1', 't2')).toThrow(
      WORKSPACE_ERRORS.TENANT_FORBIDDEN,
    );
  });

  it('creates discussion threads idempotently with stable post ordering', () => {
    const input = {
      threadId: 'thr-1',
      idempotencyKey: 'thread-create-1',
      title: 'Scope',
      topic: 'Define the project scope',
    };
    const created = createDiscussionThread(context(), [], input);
    expect(created.thread.state).toBe('open');
    expect(
      createDiscussionThread(context(), created.threads, input).thread,
    ).toBe(created.thread);

    const attachment = {
      attachmentId: 'att-1',
      fileName: 'spec.pdf',
      mediaType: 'application/pdf',
      byteSize: 100,
      storageKey: 'projects/p1/attachments/att-1',
      contents: 'private payload',
    } as DiscussionAttachment & { contents: string };

    const postInput = {
      idempotencyKey: 'post-1',
      body: 'Please review @member',
      attachments: [attachment],
    };
    const appended = appendDiscussionPost(context(), created.thread, postInput);
    expect(appended.post.sequence).toBe(1);
    expect(appended.post.mentions).toEqual(['member']);
    expect(appended.post.attachments[0]).not.toHaveProperty('contents');
    expect(
      appendDiscussionPost(context(), appended.thread, postInput).post,
    ).toBe(appended.post);
    expect(appended.thread.posts).toHaveLength(1);
  });

  it('rejects unknown mentions, invalid states and private thread leaks', () => {
    const created = createDiscussionThread(context(), [], {
      threadId: 'thr-2',
      idempotencyKey: 'thread-create-2',
      title: 'Private',
      topic: 'Restricted discussion',
    });
    expect(() =>
      appendDiscussionPost(context(), created.thread, {
        idempotencyKey: 'post-outsider',
        body: 'Hello @outsider',
      }),
    ).toThrow(WORKSPACE_ERRORS.MEMBER_FORBIDDEN);

    const archived = transitionThread(context(), created.thread, 'archived');
    expect(() => transitionThread(context(), archived, 'open')).toThrow(
      WORKSPACE_ERRORS.STALE_TRANSITION,
    );

    const privateThread = createDiscussionThread(context(), [], {
      threadId: 'thr-3',
      idempotencyKey: 'thread-create-3',
      title: 'Private',
      topic: 'Sensitive',
      visibility: 'private',
      allowedUserIds: ['member'],
    }).thread;
    expect(() =>
      visibleDiscussionPosts(context('viewer'), privateThread),
    ).toThrow(WORKSPACE_ERRORS.MEMBER_FORBIDDEN);
    expect(visibleDiscussionPosts(context('member'), privateThread)).toEqual(
      [],
    );
  });

  it('applies moderation and retention to discussions', () => {
    const created = createDiscussionThread(context(), [], {
      threadId: 'thr-4',
      idempotencyKey: 'thread-create-4',
      title: 'Moderation',
      topic: 'Visible posts only',
    }).thread;
    const appended = appendDiscussionPost(context(), created, {
      idempotencyKey: 'post-4',
      body: 'Visible content',
    }).thread;
    const hidden = moderateDiscussionPost(context(), appended, 1, 'hidden');
    expect(visibleDiscussionPosts(context('member'), hidden)).toEqual([]);
    expect(visibleDiscussionPosts(context(), hidden)).toHaveLength(1);

    const expired: DiscussionThread = {
      ...created,
      threadId: 'thr-old',
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    expect(expireDiscussionThreads([created, expired], now)).toEqual([created]);
  });

  it('records, approves, rejects and supersedes project decisions', () => {
    const input = {
      decisionId: 'dec-1',
      idempotencyKey: 'decision-create-1',
      statement: 'Use Postgres for workspace metadata',
      context: 'Durability and query flexibility were required',
      alternatives: ['Document store'],
      approvers: ['maintainer', 'member'],
      effectiveDate: '2026-12-01T00:00:00.000Z',
      evidenceRefs: ['ev-1', 'ev-1'],
    };
    const recorded = recordProjectDecision(context(), [], input);
    let decisions: ProjectDecision[] = recorded.decisions;
    expect(recorded.decision.status).toBe('draft');
    expect(recorded.decision.evidenceRefs).toEqual(['ev-1']);
    expect(recordProjectDecision(context(), decisions, input).decision).toBe(
      recorded.decision,
    );

    decisions = approveProjectDecision(context(), decisions, 'dec-1').decisions;
    expect(decisions[0].status).toBe('draft');
    const fullyApproved = approveProjectDecision(
      context('member'),
      decisions,
      'dec-1',
    );
    decisions = fullyApproved.decisions;
    expect(fullyApproved.decision.status).toBe('approved');
    expect(() => approveProjectDecision(context(), decisions, 'dec-1')).toThrow(
      WORKSPACE_ERRORS.STALE_TRANSITION,
    );

    const replacement = recordProjectDecision(context(), decisions, {
      decisionId: 'dec-2',
      idempotencyKey: 'decision-create-2',
      statement: 'Use Postgres with read replicas',
      context: 'Reporting demand increased',
      approvers: ['maintainer'],
      effectiveDate: '2026-12-02T00:00:00.000Z',
      supersedes: 'dec-1',
    });
    decisions = replacement.decisions;
    expect(replacement.decision.supersedes).toBe('dec-1');
    decisions = approveProjectDecision(context(), decisions, 'dec-2').decisions;
    expect(
      decisions.find((decision) => decision.decisionId === 'dec-1')?.status,
    ).toBe('superseded');
    expect(visibleDecisions(context('viewer'), decisions)[0].decisionId).toBe(
      'dec-2',
    );

    const rejected = rejectProjectDecision(
      context(),
      [recorded.decision],
      'dec-1',
    );
    expect(rejected.decision.status).toBe('rejected');
    expect(visibleDecisions(context(), rejected.decisions)).toEqual([]);
    expect(() =>
      rejectProjectDecision(context(), rejected.decisions, 'dec-1'),
    ).toThrow(WORKSPACE_ERRORS.STALE_TRANSITION);
  });

  it('connects providers without raw credentials and revokes safely', () => {
    const input = {
      connectionId: 'conn-1',
      idempotencyKey: 'connection-create-1',
      provider: 'github' as const,
      externalAccountId: 'acct-1',
      scopes: ['repo:read', 'webhook:read'],
      tokenRef: 'vault:github-token',
      expiresAt: '2026-12-20T00:00:00.000Z',
    };
    const connected = connectProvider(context(), [], input);
    let connections: ProviderConnection[] = connected.connections;
    expect(connectProvider(context(), connections, input).connection).toBe(
      connected.connection,
    );

    const rawCredentialInput = {
      ...input,
      connectionId: 'conn-raw',
      idempotencyKey: 'connection-raw',
      token: 'ghp_secret',
    };
    expect(() => connectProvider(context(), [], rawCredentialInput)).toThrow(
      `${WORKSPACE_ERRORS.INVALID_INPUT}:credentials`,
    );

    let references: SourceReference[] = [];
    const linked = linkSourceReference(
      context(),
      connected.connection,
      references,
      {
        referenceId: 'ref-1',
        idempotencyKey: 'reference-create-1',
        connectionId: 'conn-1',
        kind: 'repository',
        externalId: 'repo-1',
        displayName: 'chainVerse',
        url: 'https://github.com/Gen-x-academy/chainVerse-backend',
        metadata: {
          visibility: 'public',
          token: 'raw',
          nested: { secret: true },
        },
      },
    );
    references = linked.references;
    expect(linked.reference.metadata).not.toHaveProperty('token');
    expect(linked.reference.metadata).not.toHaveProperty('nested');
    expect(linked.reference.metadata.visibility).toBe('public');
    expect(
      linkSourceReference(context(), connected.connection, references, {
        referenceId: 'ref-1',
        idempotencyKey: 'reference-create-1',
        connectionId: 'conn-1',
        kind: 'repository',
        externalId: 'repo-1',
        displayName: 'chainVerse',
        url: 'https://github.com/Gen-x-academy/chainVerse-backend',
        metadata: {},
      }).reference,
    ).toBe(linked.reference);
    expect(() =>
      linkSourceReference(context(), connected.connection, references, {
        referenceId: 'ref-2',
        idempotencyKey: 'reference-bad-url',
        connectionId: 'conn-1',
        kind: 'commit',
        externalId: 'sha-2',
        displayName: 'Bad',
        url: 'javascript:alert(1)',
        metadata: {},
      }),
    ).toThrow(`${WORKSPACE_ERRORS.INVALID_INPUT}:url`);

    const revoked = revokeProviderConnection(context(), connections, 'conn-1');
    connections = revoked.connections;
    expect(
      revokeProviderConnection(context(), connections, 'conn-1').connection,
    ).toBe(revoked.connection);
    expect(() =>
      linkSourceReference(context(), revoked.connection, references, {
        referenceId: 'ref-3',
        idempotencyKey: 'reference-after-revoke',
        connectionId: 'conn-1',
        kind: 'commit',
        externalId: 'sha-3',
        displayName: 'Blocked',
      }),
    ).toThrow(WORKSPACE_ERRORS.CONNECTION_REVOKED);
  });

  it('sanitizes metadata and verifies webhook signatures and replay windows', () => {
    expect(
      sanitizeSourceMetadata({
        branch: 'main',
        api_key: 'raw',
        count: 3,
        merged: true,
        missing: null,
        nested: {},
      }),
    ).toEqual({ branch: 'main', count: 3, merged: true, missing: null });

    const rawBody = JSON.stringify({ event: 'commit' });
    const secret = 'webhook-secret';
    const signature = `sha256=${createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;
    const timestamp = Math.floor(now.getTime() / 1000);
    expect(
      verifyProviderWebhook(rawBody, signature, secret, timestamp, now),
    ).toBe(true);
    expect(() =>
      verifyProviderWebhook(rawBody, 'sha256=deadbeef', secret, timestamp, now),
    ).toThrow(WORKSPACE_ERRORS.WEBHOOK_SIGNATURE_INVALID);
    expect(() =>
      verifyProviderWebhook(rawBody, signature, secret, timestamp - 1000, now),
    ).toThrow(WORKSPACE_ERRORS.WEBHOOK_REPLAY);
  });

  it('maps webhooks to safe source references only', () => {
    const connection = connectProvider(context(), [], {
      connectionId: 'conn-webhook',
      idempotencyKey: 'connection-webhook',
      provider: 'gitlab',
      externalAccountId: 'acct-webhook',
      scopes: ['repo:read'],
      tokenRef: 'vault:gitlab-token',
      expiresAt: '2026-12-20T00:00:00.000Z',
    }).connection;
    const event = {
      eventId: 'evt-1',
      type: 'commit',
      externalId: 'sha-1',
      displayName: 'Commit sha-1',
      url: 'https://gitlab.com/group/project/-/commit/sha-1',
      metadata: { authorEmail: 'private@example.com', message: 'Safe message' },
      payload: { privateResearch: 'do not copy' },
    } as ProviderWebhookEvent & { payload: unknown };

    const mapped = mapProviderWebhook(context(), connection, [], event);
    expect(mapped.reference.kind).toBe('commit');
    expect(mapped.reference.metadata).not.toHaveProperty('authorEmail');
    expect(JSON.stringify(mapped.reference)).not.toContain('privateResearch');
    expect(
      mapProviderWebhook(context(), connection, mapped.references, event)
        .reference,
    ).toBe(mapped.reference);
  });

  it('builds permission-filtered, paginated activity with read state and retention', () => {
    let events: ActivityEvent[] = [];
    const input = {
      eventId: 'act-1',
      idempotencyKey: 'activity-create-1',
      type: 'thread_created' as const,
      summary: 'Created scope thread password=hunter2',
      deepLink: '/projects/p1/threads/thr-1',
    };
    const built = buildActivityEvent(context(), events, input);
    events = built.events;
    expect(built.event.summary).toBe(
      'Created scope thread password=[redacted]',
    );
    expect(built.event.sequence).toBe(1);
    expect(buildActivityEvent(context(), events, input).event).toBe(
      built.event,
    );
    expect(() =>
      buildActivityEvent(context(), events, {
        eventId: 'act-bad',
        idempotencyKey: 'activity-bad',
        type: 'thread_created',
        summary: 'Bad link',
        deepLink: 'https://evil.example',
      }),
    ).toThrow(`${WORKSPACE_ERRORS.INVALID_INPUT}:deepLink`);

    const privateEvent = buildActivityEvent(context(), events, {
      eventId: 'act-2',
      idempotencyKey: 'activity-create-2',
      type: 'post_added',
      summary: 'Private update',
      deepLink: '/projects/p1/threads/thr-1',
      visibility: 'private',
      allowedUserIds: ['member'],
    });
    events = privateEvent.events;
    expect(
      listActivityFeed(context('viewer'), events).entries.map(
        (entry) => entry.eventId,
      ),
    ).toEqual(['act-1']);
    expect(
      listActivityFeed(context('member'), events).entries.map(
        (entry) => entry.eventId,
      ),
    ).toEqual(['act-2', 'act-1']);

    const firstPage = listActivityFeed(context('member'), events, { limit: 1 });
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe(2);
    const secondPage = listActivityFeed(context('member'), events, {
      limit: 1,
      before: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.entries[0].eventId).toBe('act-1');

    const marked = markActivityRead(context('member'), events, 'act-2');
    events = marked.events;
    expect(markActivityRead(context('member'), events, 'act-2').events).toBe(
      events,
    );
    expect(
      listActivityFeed(context('member'), events).entries.find(
        (entry) => entry.eventId === 'act-2',
      )?.unread,
    ).toBe(false);

    const stale: ActivityEvent = {
      ...built.event,
      eventId: 'act-old',
      sequence: 0,
      occurredAt: '2020-01-01T00:00:00.000Z',
    };
    expect(expireActivityEvents([built.event, stale], now)).toEqual([
      built.event,
    ]);
  });
});
