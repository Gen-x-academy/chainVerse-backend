import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon, StrKey } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly server: Horizon.Server;
  private server: Horizon.Server;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    this.server = new Horizon.Server(url);
import { Horizon, Keypair, StrKey } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly server: Horizon.Server;

  constructor(private readonly config: ConfigService) {
    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    this.server = new Horizon.Server(horizonUrl);
  }

  async getAccount(publicKey: string) {
    return this.server.loadAccount(publicKey);
  }

  isValidPublicKey(key: string): boolean {
    return StrKey.isValidEd25519PublicKey(key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async submitTransaction(transaction: any) {
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

  async getBalance(publicKey: string): Promise<{
    publicKey: string;
    xlm: string;
    chv: string | null;
    allBalances: Horizon.HorizonApi.BalanceLine[];
  }> {
    if (!this.isValidPublicKey(publicKey)) {
      throw new BadRequestException('Invalid Stellar public key format');
    }

    const account = await this.server.loadAccount(publicKey);
    const chvContractId = this.config.get<string>('CONTRACT_CHV_TOKEN') ?? '';

    const xlmLine = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLineNative =>
        b.asset_type === 'native',
    );

    const chvLine = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLineAsset =>
        b.asset_type !== 'native' &&
        (b.asset_code === 'CHV' ||
          ('asset_issuer' in b && b.asset_issuer === chvContractId)),
    );

    return {
      publicKey,
      xlm: xlmLine?.balance ?? '0',
      chv: chvLine?.balance ?? null,
      allBalances: account.balances,
    };
  }

  async createAccount(): Promise<{ publicKey: string; funded: boolean; message: string }> {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();

    let funded = false;
    try {
      const res = await fetch(
        `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`,
      );
      funded = res.ok;
    } catch {
      funded = false;
    }

    return {
      publicKey,
      funded,
      message:
        'Account created on testnet. You must securely store your own secret key — the server never holds it.',
    };
  }

  getServer(): Horizon.Server {
    return this.server;
  }
}
