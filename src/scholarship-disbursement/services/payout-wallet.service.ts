import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext } from '../../common/audit/audit-context';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { DomainEvents } from '../../events/event-names';
import { ScholarshipPayoutWalletChangedPayload } from '../../events/payloads/scholarship-payout-wallet-changed.payload';
import {
  PaymentHoldReason,
  ScholarshipPaymentStatus,
} from '../domain/payment-state';
import {
  buildWalletChallengeMessage,
  verifyWalletSignature,
} from '../domain/wallet-challenge';
import {
  PayoutWalletChallenge,
  PayoutWalletChallengeDocument,
} from '../schemas/payout-wallet-challenge.schema';
import {
  PayoutWallet,
  PayoutWalletDocument,
  PayoutWalletStatus,
} from '../schemas/payout-wallet.schema';
import {
  ScholarshipPayment,
  ScholarshipPaymentDocument,
} from '../schemas/scholarship-payment.schema';
import { ScholarshipStellarGateway } from '../stellar/scholarship-stellar.gateway';

export interface IssuedChallenge {
  challengeId: string;
  address: string;
  network: string;
  message: string;
  expiresAt: Date;
}

export interface VerifiedWalletResult {
  wallet: PayoutWalletDocument;
  changed: boolean;
  heldPayments: number;
}

/**
 * Proves that a recipient controls the Stellar address payouts go to.
 *
 * A recipient requests a challenge for an address, signs the returned
 * domain-separated message in their wallet (SEP-53), and submits the
 * signature. Challenges are single-use, expire, and lock after too many bad
 * signatures. Replacing an already verified address puts every not-yet-sent
 * payment on hold until an organization admin releases it.
 */
@Injectable()
export class PayoutWalletService {
  private readonly logger = new Logger(PayoutWalletService.name);

  constructor(
    @InjectModel(PayoutWallet.name)
    private readonly walletModel: Model<PayoutWalletDocument>,
    @InjectModel(PayoutWalletChallenge.name)
    private readonly challengeModel: Model<PayoutWalletChallengeDocument>,
    @InjectModel(ScholarshipPayment.name)
    private readonly paymentModel: Model<ScholarshipPaymentDocument>,
    private readonly gateway: ScholarshipStellarGateway,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async issueChallenge(
    organizationId: string,
    recipientId: string,
    address: string,
  ): Promise<IssuedChallenge> {
    const now = new Date();
    // Only the newest challenge stays usable.
    await this.challengeModel
      .updateMany(
        {
          organizationId,
          recipientId,
          consumedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { expiresAt: now } },
      )
      .exec();

    const ttl =
      this.config.get<number>('scholarships.walletChallengeTtlSeconds') ?? 600;
    const id = new Types.ObjectId();
    const fields = {
      challengeId: id.toHexString(),
      network: this.gateway.network,
      organizationId,
      recipientId,
      address,
      nonce: randomBytes(32).toString('hex'),
      expiresAt: new Date(now.getTime() + ttl * 1000),
    };
    const message = buildWalletChallengeMessage(fields);

    await this.challengeModel.create({
      _id: id,
      organizationId,
      recipientId,
      address,
      network: fields.network,
      nonce: fields.nonce,
      message,
      expiresAt: fields.expiresAt,
    });

    return {
      challengeId: fields.challengeId,
      address,
      network: fields.network,
      message,
      expiresAt: fields.expiresAt,
    };
  }

  async verifyChallenge(
    organizationId: string,
    recipientId: string,
    challengeId: string,
    signature: string,
    actor: AuditContext,
  ): Promise<VerifiedWalletResult> {
    const challenge = await this.challengeModel
      .findOne({ _id: challengeId, organizationId, recipientId })
      .exec();
    if (!challenge) {
      throw new ResourceNotFoundException(
        'Wallet challenge not found',
        ErrorCode.RES_WALLET_CHALLENGE_NOT_FOUND,
      );
    }

    const maxAttempts = this.maxAttempts;
    const now = new Date();
    this.assertUsable(challenge, now, maxAttempts);

    if (
      !verifyWalletSignature(challenge.address, challenge.message, signature)
    ) {
      await this.challengeModel
        .updateOne({ _id: challenge._id }, { $inc: { failedAttempts: 1 } })
        .exec();
      throw new BusinessRuleException(
        'Signature does not match the challenge and address',
        ErrorCode.BIZ_WALLET_SIGNATURE_INVALID,
      );
    }

    // Consume atomically so a signature can be redeemed exactly once.
    const consumed = await this.challengeModel
      .findOneAndUpdate(
        {
          _id: challenge._id,
          consumedAt: null,
          expiresAt: { $gt: now },
          failedAttempts: { $lt: maxAttempts },
        },
        { $set: { consumedAt: now } },
        { new: true },
      )
      .exec();
    if (!consumed) {
      throw new BusinessRuleException(
        'Challenge has already been used',
        ErrorCode.BIZ_WALLET_CHALLENGE_USED,
      );
    }

    return this.bindAddress(consumed, actor);
  }

  findVerified(
    organizationId: string,
    recipientId: string,
  ): Promise<PayoutWalletDocument | null> {
    return this.walletModel
      .findOne({
        organizationId,
        recipientId,
        status: PayoutWalletStatus.VERIFIED,
      })
      .exec();
  }

  async requireVerified(
    organizationId: string,
    recipientId: string,
  ): Promise<PayoutWalletDocument> {
    const wallet = await this.findVerified(organizationId, recipientId);
    if (!wallet) {
      throw new ResourceNotFoundException(
        'No verified payout wallet',
        ErrorCode.RES_PAYOUT_WALLET_NOT_FOUND,
      );
    }
    return wallet;
  }

  history(
    organizationId: string,
    recipientId: string,
  ): Promise<PayoutWalletDocument[]> {
    return this.walletModel
      .find({ organizationId, recipientId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  private async bindAddress(
    challenge: PayoutWalletChallengeDocument,
    actor: AuditContext,
  ): Promise<VerifiedWalletResult> {
    const { organizationId, recipientId, address } = challenge;
    const now = new Date();
    const current = await this.findVerified(organizationId, recipientId);

    if (current && current.address === address) {
      current.verifiedAt = now;
      current.challengeId = challenge.id;
      await current.save();
      return { wallet: current, changed: false, heldPayments: 0 };
    }

    // Hold first: once a payment is on hold the executor's compare-and-set
    // from `scheduled` fails, so nothing can be sent to either address while
    // the swap below is in progress.
    let heldPayments = 0;
    if (current) {
      const held = await this.paymentModel
        .updateMany(
          {
            organizationId,
            recipientId,
            status: ScholarshipPaymentStatus.SCHEDULED,
          },
          {
            $set: {
              status: ScholarshipPaymentStatus.ON_HOLD,
              holdReason: PaymentHoldReason.PAYOUT_WALLET_CHANGED,
              leaseOwner: null,
              leaseUntil: null,
            },
          },
        )
        .exec();
      heldPayments = held.modifiedCount;

      await this.walletModel
        .updateOne(
          { _id: current._id, status: PayoutWalletStatus.VERIFIED },
          {
            $set: {
              status: PayoutWalletStatus.SUPERSEDED,
              supersededAt: now,
            },
          },
        )
        .exec();
    }

    let wallet: PayoutWalletDocument;
    try {
      wallet = await this.walletModel.create({
        organizationId,
        recipientId,
        address,
        status: PayoutWalletStatus.VERIFIED,
        verifiedAt: now,
        challengeId: challenge.id,
      });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new ResourceConflictException(
          'Another payout wallet verification completed concurrently; retry',
        );
      }
      throw err;
    }

    await this.audit.record({
      action: current
        ? AuditAction.PAYOUT_WALLET_CHANGED
        : AuditAction.PAYOUT_WALLET_VERIFIED,
      context: actor,
      target: { type: 'payout_wallet', id: wallet.id },
      before: current ? { address: current.address } : null,
      after: { address, organizationId, recipientId, heldPayments },
    });

    if (current) {
      this.logger.warn(
        `Payout wallet changed org=${organizationId} recipient=${recipientId}; ${heldPayments} payment(s) placed on hold`,
      );
      const payload = Object.assign(
        new ScholarshipPayoutWalletChangedPayload(),
        {
          organizationId,
          recipientId,
          previousAddress: current.address,
          newAddress: address,
          heldPayments,
        },
      );
      this.events.emit(DomainEvents.SCHOLARSHIP_PAYOUT_WALLET_CHANGED, payload);
    }

    return { wallet, changed: Boolean(current), heldPayments };
  }

  private assertUsable(
    challenge: PayoutWalletChallengeDocument,
    now: Date,
    maxAttempts: number,
  ): void {
    if (challenge.consumedAt) {
      throw new BusinessRuleException(
        'Challenge has already been used',
        ErrorCode.BIZ_WALLET_CHALLENGE_USED,
      );
    }
    if (challenge.expiresAt.getTime() <= now.getTime()) {
      throw new BusinessRuleException(
        'Challenge has expired; request a new one',
        ErrorCode.BIZ_WALLET_CHALLENGE_EXPIRED,
      );
    }
    if (challenge.failedAttempts >= maxAttempts) {
      throw new BusinessRuleException(
        'Too many invalid signatures; request a new challenge',
        ErrorCode.BIZ_WALLET_CHALLENGE_LOCKED,
      );
    }
  }

  private get maxAttempts(): number {
    return (
      this.config.get<number>('scholarships.walletChallengeMaxAttempts') ?? 5
    );
  }
}
