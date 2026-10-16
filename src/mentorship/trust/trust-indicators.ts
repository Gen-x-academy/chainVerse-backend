/**
 * Explainable mentor trust indicators (MENTOR-014).
 *
 * Pure and deterministic: the same signals always give the same result. Inputs
 * are limited to counts of platform activity; no demographic or other
 * protected attribute is read, and raw inputs are never returned — only a
 * level plus a plain-language meaning.
 */
export interface TrustSignals {
  profileFieldsTotal: number;
  profileFieldsCompleted: number;
  verifiedCredentials: number;
  responseSampleSize: number;
  respondedWithin48h: number;
  sessionsScheduled: number;
  sessionsDelivered: number;
  upheldSafetyReports: number;
}

export type IndicatorLevel = 'insufficient_data' | 'low' | 'medium' | 'high';

export interface TrustIndicator {
  key: 'completion' | 'verification' | 'response' | 'delivery' | 'safety';
  level: IndicatorLevel;
  meaning: string;
}

/** Below this many observations a rate is not shown, to avoid noisy badges. */
export const MIN_SAMPLE = 5;

const level = (ratio: number, medium: number, high: number): IndicatorLevel =>
  ratio >= high ? 'high' : ratio >= medium ? 'medium' : 'low';

const clampCount = (n: number): number =>
  Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

export function emptySignals(): TrustSignals {
  return {
    profileFieldsTotal: 0,
    profileFieldsCompleted: 0,
    verifiedCredentials: 0,
    responseSampleSize: 0,
    respondedWithin48h: 0,
    sessionsScheduled: 0,
    sessionsDelivered: 0,
    upheldSafetyReports: 0,
  };
}

export function computeTrustIndicators(input: TrustSignals): TrustIndicator[] {
  const s: TrustSignals = {
    profileFieldsTotal: clampCount(input.profileFieldsTotal),
    profileFieldsCompleted: clampCount(input.profileFieldsCompleted),
    verifiedCredentials: clampCount(input.verifiedCredentials),
    responseSampleSize: clampCount(input.responseSampleSize),
    respondedWithin48h: clampCount(input.respondedWithin48h),
    sessionsScheduled: clampCount(input.sessionsScheduled),
    sessionsDelivered: clampCount(input.sessionsDelivered),
    upheldSafetyReports: clampCount(input.upheldSafetyReports),
  };
  // Counts can never exceed their denominators.
  s.profileFieldsCompleted = Math.min(s.profileFieldsCompleted, s.profileFieldsTotal);
  s.respondedWithin48h = Math.min(s.respondedWithin48h, s.responseSampleSize);
  s.sessionsDelivered = Math.min(s.sessionsDelivered, s.sessionsScheduled);

  const completionRatio = s.profileFieldsTotal
    ? s.profileFieldsCompleted / s.profileFieldsTotal
    : 0;

  const indicators: TrustIndicator[] = [
    {
      key: 'completion',
      level: s.profileFieldsTotal === 0 ? 'insufficient_data' : level(completionRatio, 0.6, 0.9),
      meaning: 'How much of the mentor’s profile has been filled in.',
    },
    {
      key: 'verification',
      level: s.verifiedCredentials >= 2 ? 'high' : s.verifiedCredentials === 1 ? 'medium' : 'low',
      meaning: 'How many of the mentor’s credentials a reviewer has verified.',
    },
    {
      key: 'response',
      level:
        s.responseSampleSize < MIN_SAMPLE
          ? 'insufficient_data'
          : level(s.respondedWithin48h / s.responseSampleSize, 0.6, 0.85),
      meaning: 'How often the mentor replies to requests within 48 hours.',
    },
    {
      key: 'delivery',
      level:
        s.sessionsScheduled < MIN_SAMPLE
          ? 'insufficient_data'
          : level(s.sessionsDelivered / s.sessionsScheduled, 0.7, 0.9),
      meaning: 'How often scheduled sessions were actually delivered.',
    },
    {
      key: 'safety',
      level: s.upheldSafetyReports === 0 ? 'high' : s.upheldSafetyReports === 1 ? 'medium' : 'low',
      meaning: 'Whether moderators upheld any safety reports about the mentor.',
    },
  ];
  return indicators;
}
