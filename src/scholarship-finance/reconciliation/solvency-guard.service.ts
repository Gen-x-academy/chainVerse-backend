import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessRuleException, ErrorCode } from '../../common/errors';
import { AppConfig } from '../../config/app.config';
import { fromMinorUnits } from '../common/money';
import { LedgerSnapshot } from '../ledger/ledger-query.service';
import { ScholarshipProgramDocument } from '../programs/scholarship-program.schema';
import { ReconciliationAlertsService } from './reconciliation-alerts.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * Gate evaluated before any entry that creates a new obligation
 * (reservation or award). It refuses the entry when:
 *
 *  1. an unresolved critical reconciliation alert exists for the program;
 *  2. the latest reconciliation is missing, stale or found discrepancies
 *     (a stale Horizon-backed program is reconciled inline first); or
 *  3. the verified external balance cannot cover existing obligations plus
 *     the new amount.
 */
@Injectable()
export class SolvencyGuardService {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly alerts: ReconciliationAlertsService,
    private readonly config: ConfigService,
  ) {}

  async assertCanTakeObligation(
    program: ScholarshipProgramDocument,
    /** Increase in total obligations caused by the entry (0 for an award). */
    newObligations: bigint,
    snapshot: LedgerSnapshot,
  ): Promise<void> {
    const programId = String(program._id);

    const blocking = await this.alerts.findBlocking(programId);
    if (blocking.length) {
      throw new BusinessRuleException(
        `New awards are blocked by unresolved reconciliation alerts: ${blocking
          .map((a) => `${a.type} (${String(a._id)})`)
          .join(', ')}`,
        ErrorCode.BIZ_RECONCILIATION_BLOCKED,
      );
    }

    let run = await this.reconciliation.latest(programId);
    const maxAgeMs =
      this.config.get<AppConfig['scholarshipFinance']>('scholarshipFinance')
        ?.reconciliationMaxAgeMs ?? 3_600_000;
    const stale =
      !run || Date.now() - new Date(run.createdAt!).getTime() > maxAgeMs;

    if (stale) {
      if (program.externalBalanceSource === 'manual') {
        throw new BusinessRuleException(
          'No recent reconciliation for this program; record a treasury balance snapshot before new awards',
          ErrorCode.BIZ_RECONCILIATION_BLOCKED,
        );
      }
      run = await this.reconciliation.run(program, {
        trigger: 'pre_obligation',
        triggeredBy: 'system:solvency-guard',
      });
    }

    if (run!.status !== 'balanced') {
      throw new BusinessRuleException(
        `Latest reconciliation found discrepancies: ${run!.discrepancies.map((d) => d.type).join(', ')}`,
        ErrorCode.BIZ_RECONCILIATION_BLOCKED,
      );
    }

    // Conservative assets: the lower of the last verified external balance
    // (adjusted for payouts that may already have left the treasury) and the
    // current ledger treasury, so outflows since that run are respected.
    const verifiedExternal =
      BigInt(run!.inputs.externalBalance) - BigInt(run!.results.explainedDrift);
    const assets =
      verifiedExternal < snapshot.balances.treasury
        ? verifiedExternal
        : snapshot.balances.treasury;
    const obligations =
      snapshot.balances.reserved + snapshot.balances.awards_payable;
    const headroom = assets - obligations - newObligations;
    if (headroom < 0n) {
      throw new BusinessRuleException(
        `Insufficient verified funds: obligations would exceed treasury by ${fromMinorUnits(-headroom)} ${program.asset.code}`,
        ErrorCode.BIZ_PROGRAM_INSOLVENT,
      );
    }
  }
}
