import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const BACKUP_VERSION = 1;

/**
 * All e-library Mongoose model names as registered in the module.
 * Using model names lets us derive actual collection names at runtime,
 * which is correct even for schemas that don't specify an explicit
 * `collection` option.
 */
const ELIBRARY_MODEL_NAMES = [
  'Book',
  'BookCopy',
  'Loan',
  'Hold',
  'LibraryPolicy',
  'DigitalLoan',
  'PatronBalance',
  'LedgerEntry',
  'ChargePolicy',
  'SchedulerJobRun',
  'WaiverRequest',
  'ReminderLog',
  'ReminderPreference',
  'ELibraryAuditLog',
  'ClosureCalendar',
  'BorrowerPreference',
  'BookReview',
  'ContentReport',
  'NotificationEvent',
  'PatronNote',
  'SavedList',
  'PatronProfile',
  'Donor',
  'Donation',
  'LibraryLocation',
  'StocktakeSession',
  'AutoRenewalRun',
];

export interface BackupMetadata {
  version: number;
  exportedAt: string;
  collectionCount: number;
  documentCounts: Record<string, number>;
  totalDocuments: number;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  data: Record<string, unknown[]>;
}

export interface RestoreReport {
  restoredAt: string;
  collectionsRestored: number;
  documentsInserted: number;
  collectionsSkipped: string[];
  errors: string[];
}

export interface BackupManifest {
  availableCollections: Array<{
    name: string;
    documentCount: number;
  }>;
  totalDocuments: number;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Resolve actual MongoDB collection names for all e-library models.
   */
  private getLibraryCollectionNames(): string[] {
    const names: string[] = [];
    for (const modelName of ELIBRARY_MODEL_NAMES) {
      const model = this.connection.model(modelName);
      if (model) {
        names.push(model.collection.name);
      }
    }
    return names;
  }

  async exportCollections(collections?: string[]): Promise<BackupPayload> {
    const targetCollections = collections?.length
      ? collections
      : this.getLibraryCollectionNames();

    const documentCounts: Record<string, number> = {};
    const data: Record<string, unknown[]> = {};

    let totalDocuments = 0;

    for (const collName of targetCollections) {
      try {
        const coll = this.connection.collection(collName);
        const docs = await coll.find().toArray();
        data[collName] = docs.map((doc) => ({
          ...doc,
          _id: doc._id?.toString() ?? doc._id,
        }));
        documentCounts[collName] = docs.length;
        totalDocuments += docs.length;
      } catch (err) {
        this.logger.warn(
          `Failed to export collection ${collName}: ${(err as Error).message}`,
        );
        documentCounts[collName] = 0;
        data[collName] = [];
      }
    }

    return {
      metadata: {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        collectionCount: Object.keys(documentCounts).length,
        documentCounts,
        totalDocuments,
      },
      data,
    };
  }

  async getBackupManifest(): Promise<BackupManifest> {
    const collectionNames = this.getLibraryCollectionNames();
    const availableCollections: Array<{
      name: string;
      documentCount: number;
    }> = [];

    let totalDocuments = 0;

    for (const collName of collectionNames) {
      try {
        const coll = this.connection.collection(collName);
        const count = await coll.countDocuments();
        availableCollections.push({ name: collName, documentCount: count });
        totalDocuments += count;
      } catch (err) {
        this.logger.warn(
          `Failed to count documents in ${collName}: ${(err as Error).message}`,
        );
        availableCollections.push({ name: collName, documentCount: 0 });
      }
    }

    return { availableCollections, totalDocuments };
  }

  async restoreFromBackup(payload: BackupPayload): Promise<RestoreReport> {
    this.validateBackupPayload(payload);

    const restoredAt = new Date().toISOString();
    const collectionsSkipped: string[] = [];
    const errors: string[] = [];
    let documentsInserted = 0;
    let collectionsRestored = 0;

    for (const [collName, docs] of Object.entries(payload.data)) {
      if (!docs?.length) {
        collectionsSkipped.push(collName);
        continue;
      }

      try {
        const coll = this.connection.collection(collName);

        await coll.deleteMany({});

        const hydratedDocs = docs.map((doc: Record<string, unknown>) => ({
          ...doc,
          _id: doc._id ? new Types.ObjectId(doc._id as string) : undefined,
        }));

        await coll.insertMany(hydratedDocs as any[]);
        documentsInserted += docs.length;
        collectionsRestored++;
      } catch (err) {
        const msg = `Failed to restore collection ${collName}: ${(err as Error).message}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    return {
      restoredAt,
      collectionsRestored,
      documentsInserted,
      collectionsSkipped,
      errors,
    };
  }

  private validateBackupPayload(payload: BackupPayload): void {
    if (!payload) {
      throw new BusinessRuleException(
        'Backup payload is required',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    if (!payload.metadata || typeof payload.metadata !== 'object') {
      throw new BusinessRuleException(
        'Invalid backup metadata: missing or malformed',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    if (payload.metadata.version !== BACKUP_VERSION) {
      throw new BusinessRuleException(
        `Unsupported backup version ${payload.metadata.version}. Expected ${BACKUP_VERSION}`,
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    if (!payload.data || typeof payload.data !== 'object') {
      throw new BusinessRuleException(
        'Invalid backup data: missing or malformed',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }
  }
}
