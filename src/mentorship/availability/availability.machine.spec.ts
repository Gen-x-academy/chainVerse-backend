import {
  MentorAvailabilityStatus as S,
  applicationDisposition,
  isDiscoverable,
  resolveCurrentEntry,
  resolveUpcomingEntries,
} from './availability.machine';

const at = (iso: string) => new Date(iso);

describe('mentor availability machine', () => {
  const entries = [
    { status: S.ACCEPTING, effectiveFrom: at('2026-01-01'), sequence: 1 },
    { status: S.TEMPORARILY_UNAVAILABLE, effectiveFrom: at('2026-03-01'), sequence: 2 },
    { status: S.ACCEPTING, effectiveFrom: at('2026-04-01'), sequence: 3 },
  ];

  it('resolves the latest entry that has started', () => {
    expect(resolveCurrentEntry(entries, at('2026-02-01'))?.status).toBe(S.ACCEPTING);
    expect(resolveCurrentEntry(entries, at('2026-03-15'))?.status).toBe(
      S.TEMPORARILY_UNAVAILABLE,
    );
  });

  it('activates a scheduled change exactly at its effective date', () => {
    expect(resolveCurrentEntry(entries, at('2026-04-01'))?.sequence).toBe(3);
    expect(resolveCurrentEntry(entries, at('2026-03-31T23:59:59Z'))?.sequence).toBe(2);
  });

  it('returns undefined before any entry starts', () => {
    expect(resolveCurrentEntry(entries, at('2025-12-31'))).toBeUndefined();
  });

  it('breaks ties on effectiveFrom by sequence', () => {
    const tie = [
      { status: S.ACCEPTING, effectiveFrom: at('2026-01-01'), sequence: 1 },
      { status: S.INACTIVE, effectiveFrom: at('2026-01-01'), sequence: 2 },
    ];
    expect(resolveCurrentEntry(tie, at('2026-01-02'))?.status).toBe(S.INACTIVE);
  });

  it('lists upcoming entries soonest first', () => {
    const up = resolveUpcomingEntries(entries, at('2026-02-01'));
    expect(up.map((e) => e.sequence)).toEqual([2, 3]);
  });

  it('only shows accepting, limited and waitlist mentors in discovery', () => {
    expect(isDiscoverable(S.ACCEPTING)).toBe(true);
    expect(isDiscoverable(S.LIMITED)).toBe(true);
    expect(isDiscoverable(S.WAITLIST_ONLY)).toBe(true);
    expect(isDiscoverable(S.TEMPORARILY_UNAVAILABLE)).toBe(false);
    expect(isDiscoverable(S.INACTIVE)).toBe(false);
  });

  it('maps statuses to application dispositions', () => {
    expect(applicationDisposition(S.ACCEPTING)).toBe('open');
    expect(applicationDisposition(S.LIMITED, 2, 3)).toBe('open');
    expect(applicationDisposition(S.LIMITED, 3, 3)).toBe('waitlist');
    expect(applicationDisposition(S.WAITLIST_ONLY)).toBe('waitlist');
    expect(applicationDisposition(S.TEMPORARILY_UNAVAILABLE)).toBe('closed');
    expect(applicationDisposition(S.INACTIVE)).toBe('closed');
  });
});
