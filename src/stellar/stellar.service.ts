import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, StrKey } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private server: Server;

  constructor(private readonly config: ConfigService) {
    this.server = new Server(this.config.get<string>('stellar.horizonUrl'));
  }

  async getAccount(publicKey: string) {
    return this.server.loadAccount(publicKey);
  }

  async isValidPublicKey(key: string): Promise<boolean> {
    return StrKey.isValidEd25519PublicKey(key);
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
