import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../../stellar/stellar.service';
import { DomainEvents } from '../event-names';
import { CertificateIssuedPayload } from '../payloads/certificate-issued.payload';

@Injectable()
export class RewardListener {
  private readonly logger = new Logger(RewardListener.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(DomainEvents.CERTIFICATE_ISSUED)
  async onCertificateIssued(payload: CertificateIssuedPayload): Promise<void> {
    const rewardContract = this.config.get<string>('CONTRACT_REWARD');
    if (!rewardContract) {
      this.logger.warn(
        'CONTRACT_REWARD not configured — skipping on-chain reward for certificate %s',
        payload.certificateId,
      );
      return;
    }

    this.logger.log(
      'Triggering claim_reward on reward contract for student %s, certificate %s',
      payload.studentId,
      payload.certificateId,
    );

    try {
      // Build the Soroban call arguments for claim_reward(student_id, certificate_id)
      const { SorobanRpc, Contract, Networks, TransactionBuilder, Keypair, BASE_FEE } =
        await import('@stellar/stellar-sdk');

      const backendSecret = this.config.get<string>('STELLAR_BACKEND_SECRET');
      if (!backendSecret) {
        this.logger.warn(
          'STELLAR_BACKEND_SECRET not set — cannot sign reward transaction',
        );
        return;
      }

      const rpcUrl =
        this.config.get<string>('STELLAR_RPC_URL') ??
        'https://soroban-testnet.stellar.org';
      const networkPassphrase =
        this.config.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
        Networks.TESTNET;

      const rpc = new SorobanRpc.Server(rpcUrl);
      const keypair = Keypair.fromSecret(backendSecret);
      const sourceAccount = await rpc.getAccount(keypair.publicKey());
      const contract = new Contract(rewardContract);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(contract.call('claim_reward', ...[]))
        .setTimeout(30)
        .build();

      const prepared = await rpc.prepareTransaction(tx);
      prepared.sign(keypair);
      const response = await rpc.sendTransaction(prepared);

      this.logger.log(
        'claim_reward submitted for certificate %s — tx hash: %s',
        payload.certificateId,
        response.hash,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        'Failed to distribute reward for certificate %s: %s',
        payload.certificateId,
        message,
      );
    }
  }
}
