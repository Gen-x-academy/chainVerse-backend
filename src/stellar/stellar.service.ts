import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private server: StellarSdk.Horizon.Server;

  constructor() {
    this.server = new StellarSdk.Horizon.Server(
      'https://horizon-testnet.stellar.org',
    );
  }

  async getAccount(accountId: string) {
    try {
      const account = await this.server.loadAccount(accountId);
      return account;
    } catch (error) {
      this.logger.error(
        `Failed to load account ${accountId}: ${error.message}`,
      );
      throw error;
    }
  }

  async submitTransaction(transaction: StellarSdk.Transaction) {
    try {
      const response = await this.server.submitTransaction(transaction);
      return response;
    } catch (error) {
      this.logger.error(`Failed to submit transaction: ${error.message}`);
      throw error;
    }
  }

  async verifyPayment(input: {
    transactionHash: string;
    expectedAmount: string;
    courseId: string;
  }): Promise<{ verified: boolean; transactionId: string; timestamp: string }> {
    const { transactionHash } = input;
    const tx = await this.server.transactions().transaction(transactionHash).call();

    return {
      verified: Boolean(tx?.successful),
      transactionId: transactionHash,
      timestamp: new Date().toISOString(),
    };
  }

  getServer() {
    return this.server;
  }
}
