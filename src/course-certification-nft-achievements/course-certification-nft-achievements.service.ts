import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { Server as SorobanServer, Api as SorobanApi } from '@stellar/stellar-sdk/rpc';
import { StellarService } from '../stellar/stellar.service';
import { CreateCourseCertificationNftAchievementsDto } from './dto/create-course-certification-nft-achievements.dto';
import { UpdateCourseCertificationNftAchievementsDto } from './dto/update-course-certification-nft-achievements.dto';
import { DomainEvents } from '../events/event-names';
import { CertificateIssuedPayload } from '../events/payloads/certificate-issued.payload';

@Injectable()
export class CourseCertificationNftAchievementsService {
  private readonly logger = new Logger(CourseCertificationNftAchievementsService.name);
  private readonly items: Array<
    { id: string; transactionHash?: string } & CreateCourseCertificationNftAchievementsDto
  > = [];

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
  ) {}

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException(
        'CourseCertificationNftAchievements item not found',
      );
    }
    return item;
  }

  async create(payload: CreateCourseCertificationNftAchievementsDto) {
    const created: { id: string; transactionHash?: string } & CreateCourseCertificationNftAchievementsDto = {
      id: crypto.randomUUID(),
      ...payload,
    };
    this.items.push(created);

    // Issue certificate on-chain via the Soroban certificates contract
    try {
      created.transactionHash = await this.issueCertificateOnChain(
        created.id,
        payload.studentId,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`On-chain certificate issuance failed for ${created.id}: ${msg}`);
    }

    this.eventEmitter.emit(
      DomainEvents.CERTIFICATE_ISSUED,
      Object.assign(new CertificateIssuedPayload(), {
        certificateId: created.id,
        studentId: payload.studentId,
        courseTitle: payload.title,
      }),
    );

    return created;
  }

  update(id: string, payload: UpdateCourseCertificationNftAchievementsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CourseCertificationNftAchievements item not found',
      );
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }

  private async issueCertificateOnChain(
    certificateId: string,
    studentId: string,
  ): Promise<string> {
    const contractAddress = this.configService.get<string>('CONTRACT_CERTIFICATES');
    const secretKey = this.configService.get<string>('STELLAR_BACKEND_SECRET');
    const rpcUrl =
      this.configService.get<string>('STELLAR_RPC_URL') ??
      'https://soroban-testnet.stellar.org';
    const networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
      'Test SDF Network ; September 2015';

    if (!contractAddress || !secretKey) {
      throw new Error('CONTRACT_CERTIFICATES or STELLAR_BACKEND_SECRET is not configured');
    }

    const keypair = Keypair.fromSecret(secretKey);
    const rpc = new SorobanServer(rpcUrl);
    const account = await rpc.getAccount(keypair.publicKey());

    const contract = new Contract(contractAddress);
    const operation = contract.call(
      'mint',
      nativeToScVal(certificateId, { type: 'string' }),
      nativeToScVal(studentId, { type: 'string' }),
    );

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const preparedTx = await rpc.prepareTransaction(tx);
    preparedTx.sign(keypair);

    const result = await rpc.sendTransaction(preparedTx);

    if (result.status === 'ERROR') {
      throw new Error(`Soroban tx error: ${JSON.stringify(result.errorResult)}`);
    }

    // Poll for confirmation (up to ~20 seconds)
    const txHash = result.hash;
    let getResult = await rpc.getTransaction(txHash);
    let attempts = 0;

    while (
      getResult.status === SorobanApi.GetTransactionStatus.NOT_FOUND &&
      attempts < 10
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getResult = await rpc.getTransaction(txHash);
      attempts++;
    }

    if (getResult.status !== SorobanApi.GetTransactionStatus.SUCCESS) {
      throw new Error(`Soroban tx did not confirm: ${getResult.status}`);
    }

    return txHash;
  }
}
