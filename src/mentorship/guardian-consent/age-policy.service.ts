import { BadRequestException, Injectable } from '@nestjs/common';

/** Bump whenever the rules below change: every decision stores the version. */
export const AGE_POLICY_VERSION = 2;

/** Jurisdictions whose age of majority differs from the 18-year default. */
const MAJORITY_AGE_BY_JURISDICTION: Record<string, number> = {
  JP: 20,
  KR: 19,
  NG: 18,
  US: 18,
  GB: 18,
  DEFAULT: 18,
};

export interface AgePolicyDecision {
  guardianRequired: boolean;
  policyVersion: number;
  age: number;
  reasons: string[];
}

/**
 * Pure age-policy evaluation used before any guardian invitation is created.
 * It never trusts a client-supplied `isMinor` flag — age is derived from the
 * date of birth and the configured jurisdiction threshold.
 */
@Injectable()
export class AgePolicyService {
  evaluate(
    dateOfBirth: string,
    jurisdiction = 'DEFAULT',
    now: Date = new Date(),
  ): AgePolicyDecision {
    const dob = new Date(dateOfBirth);
    if (
      Number.isNaN(dob.getTime()) ||
      dob.getTime() > now.getTime() ||
      !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)
    ) {
      throw new BadRequestException('INVALID_DATE_OF_BIRTH');
    }

    const code = jurisdiction.toUpperCase();
    const threshold = MAJORITY_AGE_BY_JURISDICTION[code] ?? 18;
    const age = this.ageOn(dob, now);
    const guardianRequired = age < threshold;

    return {
      guardianRequired,
      policyVersion: AGE_POLICY_VERSION,
      age,
      reasons: guardianRequired
        ? [
            'PARTICIPANT_BELOW_MAJORITY',
            `JURISDICTION_THRESHOLD_${threshold}`,
          ]
        : ['PARTICIPANT_AT_OR_ABOVE_MAJORITY'],
    };
  }

  /** Whole years completed at `now`, compared in UTC to avoid TZ drift. */
  private ageOn(dob: Date, now: Date): number {
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())
    ) {
      age -= 1;
    }
    return age;
  }
}
