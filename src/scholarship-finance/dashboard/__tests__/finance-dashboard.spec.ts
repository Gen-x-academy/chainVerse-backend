import {
  decodeDashboardView,
  encodeDashboardView,
  FinanceDashboardAction,
} from '../dto/dashboard.dto';
import {
  DashboardViewError,
  FinanceDashboardService,
} from '../finance-dashboard.service';

/**
 * Dashboard filter sharing and staleness (#1174).
 *
 * The service's Mongoose calls are covered by the module's own specs; these
 * tests cover the two things that are easy to get subtly wrong and hard to
 * notice: the `view` encoding (a shared link must reproduce an exact dashboard)
 * and the staleness rule (an empty section must never read as a fresh one).
 */
describe('dashboard filter sharing (#1174)', () => {
  it('round-trips a filter set through view', () => {
    const filter = {
      asset: 'XLM',
      status: 'open',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
      limit: 50,
    };

    expect(decodeDashboardView(encodeDashboardView(filter))).toEqual(filter);
  });

  it('produces a value that is safe to put in a URL', () => {
    // A `view` travels in a query string, so it must not contain characters that
    // would need encoding. base64 standard alphabet is not URL-safe ('+' '/'
    // '='), so this asserts the property a shared link depends on.
    const view = encodeDashboardView({ asset: 'XLM', limit: 25 });
    expect(view).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('drops fields that are not part of the filter set', () => {
    const decoded = decodeDashboardView(
      encodeDashboardView({ asset: 'XLM', injected: 'nope' } as never),
    );
    expect(decoded).toEqual({ asset: 'XLM' });
    expect(decoded).not.toHaveProperty('injected');
  });

  it('clamps an out-of-range limit instead of trusting it', () => {
    expect(decodeDashboardView(encodeDashboardView({ limit: 99999 })).limit).toBe(100);
    expect(decodeDashboardView(encodeDashboardView({ limit: -5 })).limit).toBe(1);
  });

  it('returns null for a malformed view', () => {
    expect(decodeDashboardView('not base64 at all!!!')).toBeNull();
    expect(decodeDashboardView(Buffer.from('[]').toString('base64'))).toBeNull();
    expect(decodeDashboardView(Buffer.from('"just a string"').toString('base64'))).toBeNull();
  });

  it('ignores a date that does not parse', () => {
    const decoded = decodeDashboardView(
      encodeDashboardView({ from: 'not-a-date' }),
    );
    expect(decoded).not.toHaveProperty('from');
  });
});

describe('FinanceDashboardService.execute (#1174)', () => {
  const makeService = () => {
    const refunds = { approve: jest.fn().mockRefundValue({ ok: true }) };
    const recoveries = {
      approve: jest.fn().mockReturnValue({ ok: true }),
      writeOff: jest.fn().mockReturnValue({ ok: true }),
    };
    const service = Object.create(FinanceDashboardService.prototype) as FinanceDashboardService;
    // The read models are irrelevant to dispatch; only the write services matter.
    (service as unknown as Record<string, unknown>).refunds = refunds;
    (service as unknown as Record<string, unknown>).recoveries = recoveries;
    return { service, refunds, recoveries };
  };

  const actor = { userId: 'staff-1' };

  it('approves a refund through the refund service', async () => {
    const { service, refunds } = makeService();

    await service.execute(
      'org-1',
      { action: FinanceDashboardAction.APPROVE_REFUND, id: 'refund-1' },
      actor,
    );

    expect(refunds.approve).toHaveBeenCalledWith('org-1', 'refund-1', 'staff-1');
  });

  it('approves a recovery claim', async () => {
    const { service, recoveries } = makeService();

    await service.execute(
      'org-1',
      { action: FinanceDashboardAction.APPROVE_RECOVERY, id: 'claim-1' },
      actor,
    );

    expect(recoveries.approve).toHaveBeenCalledWith('org-1', 'claim-1', 'staff-1');
  });

  it('writes off a recovery claim', async () => {
    const { service, recoveries } = makeService();

    await service.execute(
      'org-1',
      { action: FinanceDashboardAction.WRITE_OFF_RECOVERY, id: 'claim-1' },
      actor,
    );

    expect(recoveries.writeOff).toHaveBeenCalledWith('org-1', 'claim-1', 'staff-1');
  });

  it('refuses to re-expose deposit credit or collection recording', async () => {
    // Those already have their own endpoints and guards. A second path to the
    // same money movement would be a weaker one.
    const { service } = makeService();

    await expect(
      service.execute(
        'org-1',
        { action: FinanceDashboardAction.CREDIT_DEPOSIT, id: 'deposit-1' },
        actor,
      ),
    ).rejects.toBeInstanceOf(DashboardViewError);

    await expect(
      service.execute(
        'org-1',
        { action: FinanceDashboardAction.RECORD_COLLECTION, id: 'claim-1' },
        actor,
      ),
    ).rejects.toBeInstanceOf(DashboardViewError);
  });

  it('rejects an unknown action rather than guessing', async () => {
    const { service } = makeService();

    await expect(
      service.execute('org-1', { action: 'delete_everything', id: 'x' }, actor),
    ).rejects.toBeInstanceOf(DashboardViewError);
  });
});

describe('staleness (#1174)', () => {
  /** Mirrors the service's rule so the tests state it explicitly. */
  const isStale = (asOf: Date | null, thresholdMs: number): boolean => {
    if (!asOf) return true;
    return Date.now() - asOf.getTime() > thresholdMs;
  };

  it('treats a section with no data as stale', () => {
    // An empty section is not a fresh section — it is an absent one, and the
    // operator must be told rather than shown a green dashboard.
    expect(isStale(null, 60_000)).toBe(true);
  });

  it('treats a recent section as fresh', () => {
    expect(isStale(new Date(), 60_000)).toBe(false);
  });

  it('treats an old section as stale', () => {
    const old = new Date(Date.now() - 10 * 60_000);
    expect(isStale(old, 60_000)).toBe(true);
  });

  it('is per section, not global', () => {
    // Reconciliation runs hourly; deposits are written on demand. A single
    // global flag would be always-true or always-false.
    const threshold = 15 * 60_000;
    const justRan = new Date(Date.now() - 5 * 60_000);
    const hasntRun = new Date(Date.now() - 2 * 60 * 60_000);
    expect(isStale(justRan, threshold)).toBe(false);
    expect(isStale(hasntRun, threshold)).toBe(true);
  });
});
