import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException, ErrorCode } from '../../common/errors';
import { AppConfig } from '../../config/app.config';
import {
  StellarAsset,
  StellarNetwork,
} from '../programs/scholarship-program.schema';

export interface HorizonTransaction {
  hash: string;
  successful: boolean;
  ledger: number;
  createdAt: string;
  memo?: string;
  memoType?: string;
  sourceAccount: string;
}

/**
 * Thin read-only client for Stellar Horizon.
 *
 * Used to (a) fetch the on-chain treasury balance for reconciliation and
 * (b) independently verify payout transactions referenced by receipts.
 * The backend never holds signing keys; transaction submission is performed
 * by the custody signer, which reports results back through the payouts API.
 */
@Injectable()
export class HorizonClient {
  private readonly logger = new Logger(HorizonClient.name);

  constructor(private readonly config: ConfigService) {}

  baseUrl(network: StellarNetwork): string {
    const horizon =
      this.config.get<AppConfig['scholarshipFinance']>(
        'scholarshipFinance',
      )?.horizon;
    return network === 'public'
      ? (horizon?.public ?? 'https://horizon.stellar.org')
      : (horizon?.testnet ?? 'https://horizon-testnet.stellar.org');
  }

  transactionUrl(network: StellarNetwork, hash: string): string {
    return `${this.baseUrl(network)}/transactions/${hash}`;
  }

  explorerUrl(network: StellarNetwork, hash: string): string {
    return `https://stellar.expert/explorer/${network}/tx/${hash}`;
  }

  /** Returns null when Horizon reports the transaction does not exist. */
  async getTransaction(
    network: StellarNetwork,
    hash: string,
  ): Promise<HorizonTransaction | null> {
    const body = await this.get(this.transactionUrl(network, hash), true);
    if (!body) return null;
    return {
      hash: String(body.hash),
      successful: Boolean(body.successful),
      ledger: Number(body.ledger),
      createdAt: String(body.created_at),
      memo: body.memo as string | undefined,
      memoType: body.memo_type as string | undefined,
      sourceAccount: String(body.source_account),
    };
  }

  /** Returns the account's balance of `asset` as a decimal string ("0" if no trustline). */
  async getAccountBalance(
    network: StellarNetwork,
    account: string,
    asset: StellarAsset,
  ): Promise<string> {
    const body = await this.get(
      `${this.baseUrl(network)}/accounts/${account}`,
      false,
    );
    const balances = (body?.balances ?? []) as Array<Record<string, string>>;
    const match = balances.find((b) =>
      asset.code === 'XLM' && !asset.issuer
        ? b.asset_type === 'native'
        : b.asset_code === asset.code && b.asset_issuer === asset.issuer,
    );
    return match?.balance ?? '0';
  }

  private async get(
    url: string,
    allowNotFound: boolean,
  ): Promise<Record<string, unknown> | null> {
    const timeoutMs =
      this.config.get<AppConfig['scholarshipFinance']>('scholarshipFinance')
        ?.horizon.timeoutMs ?? 10000;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      this.logger.warn(`Horizon request failed: ${url} (${String(err)})`);
      throw this.unavailable();
    }
    if (response.status === 404 && allowNotFound) return null;
    if (!response.ok) {
      this.logger.warn(`Horizon responded ${response.status} for ${url}`);
      throw this.unavailable();
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private unavailable() {
    return new DomainException(
      'Stellar Horizon is unavailable; try again later',
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SYS_HORIZON_UNAVAILABLE,
    );
  }
}
