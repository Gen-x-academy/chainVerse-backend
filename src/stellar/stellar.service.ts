import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon, StrKey } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private server: Horizon.Server;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    this.server = new Horizon.Server(url);
  }

  async getAccount(publicKey: string) {
    return this.server.loadAccount(publicKey);
  }

  isValidPublicKey(key: string): boolean {
    return StrKey.isValidEd25519PublicKey(key);
  }

  async submitTransaction(transaction: Parameters<Horizon.Server['submitTransaction']>[0]) {
    return this.server.submitTransaction(transaction);
  }

  async verifyPayment(input: {
    transactionHash: string;
    expectedAmount: string;
    courseId: string;
  }): Promise<{ verified: boolean; transactionId: string; timestamp: string }> {
    const { transactionHash } = input;
    const tx = await this.server
      .transactions()
      .transaction(transactionHash)
      .call();

    return {
      verified: Boolean(tx?.successful),
      transactionId: transactionHash,
      timestamp: new Date().toISOString(),
    };
  }

  getServer(): Horizon.Server {
    return this.server;
  }
}
