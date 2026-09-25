import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Horizon, Keypair, StrKey } from '@stellar/stellar-sdk';
import { CreateAccountResponseDto } from './dto/create-account-response.dto';
import {
  VerifiedPayment,
  VerifiedPaymentDocument,
} from './schemas/verified-payment.schema';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const MAINNET_ACCOUNT_GUIDE = {
  message:
    'Automatic account creation is only available on Stellar testnet. On mainnet, create and fund an account with your own wallet.',
  steps: [
    'Install a Stellar wallet such as Freighter (https://www.freighter.app/) or xBull (https://xbull.app/).',
    'Create a new account in the wallet and securely back up your secret key or recovery phrase.',
    'Fund the account via an exchange, anchor, or on-ramp service — mainnet accounts require a minimum XLM balance.',
    'Copy your public key (starts with G) and link it in your ChainVerse profile.',
  ],
};

@Injectable()
export class StellarService {
  private readonly server: Horizon.Server;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(VerifiedPayment.name)
    private readonly verifiedPaymentModel: Model<VerifiedPaymentDocument>,
  ) {
    const horizonUrl =
      this.config.get<string>('STELLAR_HORIZON_URL') ??
      'https://horizon-testnet.stellar.org';
    this.server = new Horizon.Server(horizonUrl);
  }

  isTestnet(): boolean {
    const network =
      this.config.get<string>('STELLAR_NETWORK')?.toLowerCase() ?? 'testnet';
    return network === 'testnet';
  }

  async getAccount(publicKey: string) {
    return this.server.loadAccount(publicKey);
  }

  isValidPublicKey(key: string): boolean {
    return StrKey.isValidEd25519PublicKey(key);
  }

  async submitTransaction(
    transaction: Parameters<Horizon.Server['submitTransaction']>[0],
  ) {
    return this.server.submitTransaction(transaction);
  }

  async verifyPayment(input: {
    transactionHash: string;
    expectedAmount: string | number;
    expectedDestination?: string;
    courseId?: string;
  }): Promise<{ verified: boolean; transactionId: string; timestamp: string }> {
    const { transactionHash, expectedAmount, expectedDestination, courseId } =
      input;

    const existing = await this.verifiedPaymentModel
      .findOne({ transactionHash })
      .lean()
      .exec();

    if (existing) {
      return {
        verified: existing.verified,
        transactionId: existing.transactionHash,
        timestamp:
          existing.createdAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    try {
      const tx = await this.server
        .transactions()
        .transaction(transactionHash)
        .call();

      if (!tx?.successful) {
        const result = {
          verified: false,
          transactionId: transactionHash,
          timestamp: new Date().toISOString(),
        };

        await this.verifiedPaymentModel.create({
          transactionHash,
          verified: false,
          ledgerSequence: tx?.ledger ?? undefined,
          courseId,
        });

        return result;
      }

      const operations = await this.server
        .operations()
        .forTransaction(transactionHash)
        .call();

      const expectedAmountString = expectedAmount.toString();
      const paymentOp = Array.isArray(operations?.records)
        ? operations.records.find(
            (op: { type?: string; to?: string; amount?: string }) =>
              [
                'payment',
                'path_payment_strict_receive',
                'path_payment_strict_send',
              ].includes(op.type ?? '') &&
              (!expectedDestination || op.to === expectedDestination) &&
              op.amount === expectedAmountString,
          )
        : undefined;

      const verified = Boolean(paymentOp);

      const ledgerSequence: number | undefined = tx.ledger as
        | number
        | undefined;
      const ledgerCloseTime: string | undefined = tx.closed_at as
        | string
        | undefined;
      const sourceAccount: string | undefined = tx.source_account;

      await this.verifiedPaymentModel.create({
        transactionHash,
        verified,
        ledgerSequence,
        ledgerCloseTime,
        sourceAccount,
        destinationAccount:
          paymentOp && 'to' in paymentOp
            ? (paymentOp as { to?: string }).to
            : undefined,
        amount:
          paymentOp && 'amount' in paymentOp
            ? (paymentOp as { amount?: string }).amount
            : undefined,
        assetCode:
          paymentOp && 'asset_code' in paymentOp
            ? (paymentOp as { asset_code?: string }).asset_code
            : undefined,
        assetIssuer:
          paymentOp && 'asset_issuer' in paymentOp
            ? (paymentOp as { asset_issuer?: string }).asset_issuer
            : undefined,
        memo: tx.memo ?? undefined,
        courseId,
      });

      return {
        verified,
        transactionId: transactionHash,
        timestamp: new Date().toISOString(),
      };
    } catch {
      const result = {
        verified: false,
        transactionId: transactionHash,
        timestamp: new Date().toISOString(),
      };

      await this.verifiedPaymentModel.create({
        transactionHash,
        verified: false,
        courseId,
      });

      return result;
    }
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
        b.asset_type !== 'liquidity_pool_shares' &&
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

  async createAccount(): Promise<CreateAccountResponseDto> {
    if (!this.isTestnet()) {
      throw new BadRequestException(MAINNET_ACCOUNT_GUIDE);
    }

    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const secretKey = keypair.secret();

    await this.fundViaFriendbot(publicKey);
    await this.server.loadAccount(publicKey);

    return {
      publicKey,
      secretKey,
      funded: true,
      network: 'testnet',
      message:
        'Testnet account created and funded. Save your secret key now — the server does not store it and cannot recover it. Never share your secret key with anyone.',
    };
  }

  private async fundViaFriendbot(publicKey: string): Promise<void> {
    const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new ServiceUnavailableException(
        'Unable to reach Friendbot. Try again shortly.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Friendbot failed to fund the account. Try again shortly.',
      );
    }
  }

  getServer(): Horizon.Server {
    return this.server;
  }
}
