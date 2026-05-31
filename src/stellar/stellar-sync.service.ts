import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { StellarService } from './stellar.service';

// ── Inline schema for on-chain certificate transaction records ────────────────

export type CertificateTxDocument = HydratedDocument<CertificateTx>;

@Schema({ timestamps: true, collection: 'certificate_txs' })
export class CertificateTx {
  @Prop({ required: true })
  certificateId: string;

  @Prop({ required: true })
  studentId: string;

  @Prop({ required: true })
  transactionHash: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'failed'] })
  status: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CertificateTxSchema = SchemaFactory.createForClass(CertificateTx);
CertificateTxSchema.index({ status: 1 });

// ── Sync service ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000;

@Injectable()
export class StellarSyncService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StellarSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectModel(CertificateTx.name)
    private readonly certTxModel: Model<CertificateTxDocument>,
    private readonly stellarService: StellarService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.syncPending(), POLL_INTERVAL_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncPending(): Promise<void> {
    const pending = await this.certTxModel
      .find({ status: 'pending' })
      .exec();

    if (pending.length === 0) return;

    this.logger.log(`Syncing ${pending.length} pending certificate transaction(s)`);

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
