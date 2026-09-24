import { Injectable } from '@nestjs/common';
import { Loan } from '../schemas/loan.schema';
import { ChargePolicy } from '../schemas/charge-policy.schema';

export interface FineCalculationResult {
  overdueDays: number;
  graceDays: number;
  chargeableDays: number;
  amountMinorUnits: number;
  currency: string;
  capped: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Pure calculation of an overdue fine from a loan and the policy effective
// for it. Deterministic: given the same loan, policy and `asOf` instant it
// always returns the same result, and it never reads the current time or
// any other ambient state itself — callers are responsible for passing an
// explicit `asOf`. This keeps loan/scheduler services free of hardcoded
// money rules; all of that lives in the ChargePolicy passed in.
@Injectable()
export class FineCalculationService {
  calculate(
    loan: Pick<Loan, 'dueDate'>,
    policy: ChargePolicy,
    asOf: Date,
  ): FineCalculationResult {
    const overdueMs = asOf.getTime() - loan.dueDate.getTime();
    const overdueDays = Math.max(0, Math.floor(overdueMs / MS_PER_DAY));
    const chargeableDays = Math.max(0, overdueDays - policy.graceDays);

    const rawAmount = chargeableDays * policy.dailyRateMinorUnits;
    const amountMinorUnits = Math.min(rawAmount, policy.capMinorUnits);

    return {
      overdueDays,
      graceDays: policy.graceDays,
      chargeableDays,
      amountMinorUnits,
      currency: policy.currency,
      capped: rawAmount > policy.capMinorUnits,
    };
  }
}
