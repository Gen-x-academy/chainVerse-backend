import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  BadResponseError,
  Horizon,
  Keypair,
  Memo,
  Networks,
  NotFoundError,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from '../../stellar/stellar.service';
import {
  normaliseNetwork,
  ScholarshipAssetType,
  StellarNetwork,
} from '../domain/scholarship-asset.rules';

export interface PayoutAsset {
  assetType: ScholarshipAssetType;
  code: string;
  issuer: string | null;
}

export type SubmitResult =
  /** Included in a ledger (Horizon sync submission). */
  | { kind: 'included'; ledger: number }
  /** Definitively rejected; the envelope will never be applied. */
  | { kind: 'rejected'; reason: string }
  /** Timeout or transport failure; the tx may or may not land. */
  | { kind: 'unknown'; reason: string };

export type TrustlineStatus =
  | { accountExists: false }
  | {
      accountExists: true;
      hasTrustline: boolean;
      authorized: boolean;
      balance: string | null;
      limit: string | null;
    };

export interface LedgerTip {
  sequence: number;
  closedAt: Date;
}

type OperationRecord = Record<string, unknown> & {
  id: string;
  type: string;
  paging_token?: string;
};

/**
 * Horizon access for scholarship disbursements. Everything the domain needs
 * from the network goes through here so the services stay free of SDK error
 * handling and the network passphrase is resolved in one place.
 */
@Injectable()
export class ScholarshipStellarGateway {
  private readonly logger = new Logger(ScholarshipStellarGateway.name);

  constructor(
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  get network(): StellarNetwork {
    return normaliseNetwork(this.config.get<string>('scholarships.network'));
  }

  get networkPassphrase(): string {
    return this.network === StellarNetwork.PUBLIC
      ? Networks.PUBLIC
      : Networks.TESTNET;
  }

  private get server(): Horizon.Server {
    return this.stellar.getServer();
  }

  /** Treasury signer, or `null` when payouts are not configured. */
  treasuryKeypair(): Keypair | null {
    const secret = this.config.get<string>('scholarships.treasurySecret');
    if (!secret) return null;
    try {
      return Keypair.fromSecret(secret);
    } catch {
      this.logger.error(
        'SCHOLARSHIP_TREASURY_SECRET is not a valid secret key',
      );
      return null;
    }
  }

  toStellarAsset(asset: PayoutAsset): Asset {
    return asset.assetType === ScholarshipAssetType.NATIVE
      ? Asset.native()
      : new Asset(asset.code, asset.issuer!);
  }

  /** Memo that ties a transaction to one payment attempt. */
  paymentMemo(paymentId: string, attempt: number): Buffer {
    return createHash('sha256')
      .update(`chainverse:scholarship-payment:${paymentId}:${attempt}`)
      .digest();
  }

  async loadAccount(address: string): Promise<Horizon.AccountResponse | null> {
    try {
      return await this.server.loadAccount(address);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async trustlineStatus(
    address: string,
    asset: PayoutAsset,
  ): Promise<TrustlineStatus> {
    const account = await this.loadAccount(address);
    if (!account) return { accountExists: false };

    if (asset.assetType === ScholarshipAssetType.NATIVE) {
      const native = account.balances.find((b) => b.asset_type === 'native');
      return {
        accountExists: true,
        hasTrustline: true,
        authorized: true,
        balance: native?.balance ?? '0',
        limit: null,
      };
    }

    const line = account.balances.find(
      (b) =>
        (b.asset_type === 'credit_alphanum4' ||
          b.asset_type === 'credit_alphanum12') &&
        b.asset_code === asset.code &&
        b.asset_issuer === asset.issuer,
    ) as Horizon.HorizonApi.BalanceLineAsset | undefined;

    return {
      accountExists: true,
      hasTrustline: Boolean(line),
      authorized: line ? line.is_authorized !== false : false,
      balance: line?.balance ?? null,
      limit: line?.limit ?? null,
    };
  }

  buildPayment(input: {
    source: Horizon.AccountResponse;
    signer: Keypair;
    destination: string;
    asset: PayoutAsset;
    amount: string;
    memo: Buffer;
    timeoutSeconds: number;
    feeStroops: number;
  }): { tx: Transaction; hash: string; maxTime: Date } {
    const tx = new TransactionBuilder(input.source, {
      fee: String(input.feeStroops),
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: input.destination,
          asset: this.toStellarAsset(input.asset),
          amount: input.amount,
        }),
      )
      .addMemo(Memo.hash(input.memo))
      .setTimeout(input.timeoutSeconds)
      .build();

    tx.sign(input.signer);

    const maxTime = Number(tx.timeBounds?.maxTime ?? 0);
    return {
      tx,
      hash: tx.hash().toString('hex'),
      maxTime: new Date(maxTime * 1000),
    };
  }

  async submit(tx: Transaction): Promise<SubmitResult> {
    try {
      const res = await this.server.submitTransaction(tx);
      return res.successful
        ? { kind: 'included', ledger: res.ledger }
        : { kind: 'rejected', reason: 'transaction failed' };
    } catch (err) {
      if (err instanceof BadResponseError) {
        const response = (
          err as { response?: { status?: number; data?: unknown } }
        ).response;
        if (response?.status === 400) {
          return {
            kind: 'rejected',
            reason: describeResultCodes(response.data),
          };
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      return { kind: 'unknown', reason: message };
    }
  }

  async getTransaction(
    hash: string,
  ): Promise<Horizon.ServerApi.TransactionRecord | null> {
    try {
      return await this.server.transactions().transaction(hash).call();
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  async getOperations(hash: string): Promise<OperationRecord[]> {
    const page = await this.server
      .operations()
      .forTransaction(hash)
      .limit(200)
      .call();
    return page.records as unknown as OperationRecord[];
  }

  async latestLedger(): Promise<LedgerTip> {
    const page = await this.server.ledgers().order('desc').limit(1).call();
    const tip = page.records[0];
    return { sequence: tip.sequence, closedAt: new Date(tip.closed_at) };
  }
}

/** True when an operation record moves exactly `amount` of `asset`. */
export function operationMatchesAsset(
  op: Record<string, unknown>,
  asset: PayoutAsset,
): boolean {
  if (asset.assetType === ScholarshipAssetType.NATIVE) {
    return op['asset_type'] === 'native';
  }
  return op['asset_code'] === asset.code && op['asset_issuer'] === asset.issuer;
}

function describeResultCodes(data: unknown): string {
  const codes = (data as { extras?: { result_codes?: unknown } })?.extras
    ?.result_codes;
  return codes ? `rejected: ${JSON.stringify(codes)}` : 'rejected by Horizon';
}
