import { resolveAuditContext, systemAuditContext } from './audit-context';

describe('resolveAuditContext', () => {
  it('reads identity, correlation ID and client details from the request', () => {
    const context = resolveAuditContext({
      user: { sub: 'admin-1', email: 'admin@chainverse.io', role: 'admin' },
      headers: { 'x-request-id': 'req-42', 'user-agent': 'curl/8' },
      ip: '203.0.113.9',
    });

    expect(context).toEqual({
      actorId: 'admin-1',
      actorEmail: 'admin@chainverse.io',
      actorRole: 'admin',
      requestId: 'req-42',
      ip: '203.0.113.9',
      userAgent: 'curl/8',
    });
  });

  it('falls back to user.id when sub is absent', () => {
    const context = resolveAuditContext({ user: { id: 'legacy-id' } });

    expect(context.actorId).toBe('legacy-id');
  });

  it('records an unauthenticated attempt as anonymous rather than throwing', () => {
    const context = resolveAuditContext({});

    expect(context.actorId).toBe('anonymous');
    expect(context.actorEmail).toBeNull();
    expect(context.actorRole).toBeNull();
    expect(context.requestId).toBe('unknown');
  });

  it('falls back to the socket address when ip is unset', () => {
    const context = resolveAuditContext({
      socket: { remoteAddress: '198.51.100.7' },
    });

    expect(context.ip).toBe('198.51.100.7');
  });

  it('ignores non-string identity claims', () => {
    const context = resolveAuditContext({
      user: { sub: 12345 as unknown as string },
    });

    expect(context.actorId).toBe('anonymous');
  });
});

describe('systemAuditContext', () => {
  it('marks non-HTTP callers as the system actor', () => {
    expect(systemAuditContext()).toEqual({
      actorId: 'system',
      actorEmail: null,
      actorRole: 'system',
      requestId: 'system',
      ip: null,
      userAgent: null,
    });
  });

  it('accepts an explicit request id and actor', () => {
    const context = systemAuditContext('job-7', 'reconciler');

    expect(context.requestId).toBe('job-7');
    expect(context.actorId).toBe('reconciler');
  });
});
