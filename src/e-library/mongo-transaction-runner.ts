import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

/**
 * Runs a unit of work inside a Mongo transaction, falling back to a direct
 * (non-transactional) run when the deployment is a standalone server rather
 * than a replica set — mirrors the pattern already used by
 * `CurriculumService.withCurriculumTransaction` so hold/renewal writes don't
 * hard-fail against a single-node development or test database.
 */
@Injectable()
export class LibraryTransactionRunner {
  private readonly logger = new Logger(LibraryTransactionRunner.name);
  private transactionsSupported: boolean | undefined;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run<T>(
    work: (session: ClientSession | null) => Promise<T>,
  ): Promise<T> {
    if (this.transactionsSupported === false) {
      return work(null);
    }

    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      this.transactionsSupported = true;
      return result as T;
    } catch (error) {
      if (!this.isUnsupportedTransactionError(error)) {
        throw error;
      }
      this.transactionsSupported = false;
      this.logger.warn(
        'MongoDB deployment does not support transactions; e-library writes fall back to direct (non-transactional) execution',
      );
      return work(null);
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  private isUnsupportedTransactionError(error: unknown): boolean {
    if (this.transactionsSupported === true) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    const codeName = (error as { codeName?: string } | null)?.codeName;
    return (
      codeName === 'IllegalOperation' ||
      /transaction numbers are only allowed on a replica set/i.test(message) ||
      /transactions are not supported/i.test(message) ||
      /this MongoDB deployment does not support retryable writes/i.test(message)
    );
  }
}
