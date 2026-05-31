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
  }
}
