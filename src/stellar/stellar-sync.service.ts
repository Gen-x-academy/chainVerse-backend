import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StellarService } from './stellar.service';
import {
  CertificateTx,
  CertificateTxDocument,
} from './schemas/certificate-tx.schema';

export {
  CertificateTx,
  CertificateTxDocument,
  CertificateTxSchema,
} from './schemas/certificate-tx.schema';

@Injectable()
export class StellarSyncService {
  private readonly logger = new Logger(StellarSyncService.name);

  constructor(
    @InjectModel(CertificateTx.name)
    private readonly certTxModel: Model<CertificateTxDocument>,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Polls Horizon every 60 seconds to confirm pending certificate transactions.
   * Updates status to 'confirmed' when the ledger result is successful,
   * or 'failed' when the transaction did not succeed.
   */
  @Cron('*/60 * * * * *')
  async syncPending(): Promise<void> {
    const pending = await this.certTxModel.find({ status: 'pending' }).exec();

    if (pending.length === 0) return;

    this.logger.log(
      `Syncing ${pending.length} pending certificate transaction(s)`,
    );

    await Promise.allSettled(
      pending.map(async (record) => {
        try {
          const tx = await this.stellarService
            .getServer()
            .transactions()
            .transaction(record.transactionHash)
            .call();

          const newStatus: string = tx?.successful ? 'confirmed' : 'failed';
          record.status = newStatus;
          await record.save();

          this.logger.log(
            `Certificate ${record.certificateId} tx ${record.transactionHash} → ${newStatus}`,
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Could not sync tx ${record.transactionHash}: ${msg}`,
          );
        }
      }),
    );
  }
}
