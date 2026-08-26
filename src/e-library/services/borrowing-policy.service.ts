import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PatronProfile, PatronProfileDocument, PatronStatus } from '../schemas/patron-profile.schema';

export interface PolicyResolution {
  patronId: string;
  role: string;
  status: PatronStatus;
  maxActiveLoans: number;
  maxRenewals: number;
  loanPeriodDays: number;
  maxActiveHolds: number;
  policyApplied: 'default' | 'override';
}

const DEFAULT_POLICY = {
  maxActiveLoans: 5,
  maxRenewals: 2,
  loanPeriodDays: 14,
  maxActiveHolds: 3,
};

@Injectable()
export class BorrowingPolicyService {
  constructor(
    @InjectModel(PatronProfile.name)
    private readonly patronModel: Model<PatronProfileDocument>,
  ) {}

  async resolvePolicy(patronId: string): Promise<PolicyResolution> {
    const patron = await this.patronModel.findOne({ platformUserId: patronId }).exec();
    if (!patron) {
      throw new NotFoundException('Patron profile not found');
    }

    let policyApplied: 'default' | 'override' = 'default';
    let maxActiveLoans = DEFAULT_POLICY.maxActiveLoans;
    let maxRenewals = DEFAULT_POLICY.maxRenewals;
    let loanPeriodDays = DEFAULT_POLICY.loanPeriodDays;
    let maxActiveHolds = DEFAULT_POLICY.maxActiveHolds;

    if (patron.maxActiveLoansOverride && patron.maxActiveLoansOverride > 0) {
      maxActiveLoans = patron.maxActiveLoansOverride;
      policyApplied = 'override';
    }
    if (patron.maxRenewalsOverride && patron.maxRenewalsOverride > 0) {
      maxRenewals = patron.maxRenewalsOverride;
      policyApplied = 'override';
    }
    if (patron.loanPeriodDaysOverride && patron.loanPeriodDaysOverride > 0) {
      loanPeriodDays = patron.loanPeriodDaysOverride;
      policyApplied = 'override';
    }
    if (patron.maxActiveHoldsOverride && patron.maxActiveHoldsOverride > 0) {
      maxActiveHolds = patron.maxActiveHoldsOverride;
      policyApplied = 'override';
    }

    // Tutors get extended defaults
    if (patron.role === 'tutor' && policyApplied === 'default') {
      maxActiveLoans = 10;
      loanPeriodDays = 21;
      maxActiveHolds = 5;
    }

    return {
      patronId,
      role: patron.role,
      status: patron.status,
      maxActiveLoans,
      maxRenewals,
      loanPeriodDays,
      maxActiveHolds,
      policyApplied,
    };
  }
}
