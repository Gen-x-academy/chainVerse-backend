import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  OfflineGrant,
  OfflineGrantDocument,
  OfflineGrantStatus,
} from '../schemas/offline-grant.schema';
import {
  DigitalLoan,
  DigitalLoanDocument,
  DigitalLoanStatus,
} from '../schemas/digital-loan.schema';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { CreateOfflineGrantDto } from '../dto/offline-grant.dto';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';

export function hashDeviceId(deviceId: string): string {
  return crypto.createHash('sha256').update(deviceId).digest('hex');
}

export interface OfflineAuthorization {
  valid: true;
  patronId: string;
  loanId: string;
  editionId: string;
  renditionId: string;
  expiresAt: Date;
}

@Injectable()
export class OfflineGrantService {
  constructor(
    @InjectModel(OfflineGrant.name)
    private readonly offlineGrantModel: Model<OfflineGrantDocument>,
    @InjectModel(DigitalLoan.name)
    private readonly digitalLoanModel: Model<DigitalLoanDocument>,
    private readonly transactionRunner: LibraryTransactionRunner,
  ) {}

  async createGrant(
    patronId: string,
    dto: CreateOfflineGrantDto,
  ): Promise<OfflineGrant> {
    const loan = await this.digitalLoanModel.findById(dto.loanId).exec();
    if (!loan) {
      throw new ResourceNotFoundException(
        'Digital loan not found',
        ErrorCode.RES_LOAN_NOT_FOUND,
      );
    }

    if (loan.patronId !== patronId) {
      throw new ForbiddenDomainException(
        'Offline grants can only be created for your own digital loans',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    if (loan.status !== DigitalLoanStatus.ACTIVE || loan.accessRevoked) {
      throw new ResourceConflictException(
        'Digital loan is not active or access has been revoked',
        ErrorCode.BIZ_LOAN_NOT_ACTIVE,
      );
    }

    const now = new Date();
    if (loan.expiresAt.getTime() <= now.getTime()) {
      throw new ResourceConflictException(
        'Digital loan has expired',
        ErrorCode.BIZ_LOAN_EXPIRED,
      );
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : loan.expiresAt;
    if (expiresAt.getTime() > loan.expiresAt.getTime()) {
      throw new ValidationDomainException(
        'Offline grant expiry cannot exceed the loan expiry',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }
    if (expiresAt.getTime() <= now.getTime()) {
      throw new ValidationDomainException(
        'Offline grant expiry must be in the future',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }

    const allowedDeviceCount = dto.allowedDeviceCount ?? 1;
    const deviceIdHash = hashDeviceId(dto.deviceId);

    return this.transactionRunner.run(async (session) => {
      const existing = await this.offlineGrantModel
        .findOne({
          patronId,
          loanId: loan._id,
          renditionId: dto.renditionId,
          deviceIdHash,
          status: OfflineGrantStatus.ACTIVE,
        })
        .session(session)
        .exec();
      if (existing) {
        return existing;
      }

      const activeCount = await this.offlineGrantModel
        .countDocuments({
          patronId,
          loanId: loan._id,
          renditionId: dto.renditionId,
          status: OfflineGrantStatus.ACTIVE,
        })
        .session(session)
        .exec();
      if (activeCount >= allowedDeviceCount) {
        throw new ResourceConflictException(
          `Offline grant device limit of ${allowedDeviceCount} reached for this rendition`,
          ErrorCode.BIZ_OFFLINE_DEVICE_LIMIT,
        );
      }

      const grantToken = crypto.randomBytes(32).toString('hex');
      const [grant] = await this.offlineGrantModel.create(
        [
          {
            patronId,
            loanId: loan._id,
            editionId: loan.editionId,
            renditionId: dto.renditionId,
            deviceIdHash,
            allowedDeviceCount,
            expiresAt,
            status: OfflineGrantStatus.ACTIVE,
            grantToken,
          },
        ],
        { session },
      );
      return grant;
    });
  }

  async listGrants(patronId: string): Promise<OfflineGrantDocument[]> {
    await this.offlineGrantModel
      .updateMany(
        {
          patronId,
          status: OfflineGrantStatus.ACTIVE,
          expiresAt: { $lte: new Date() },
        },
        { $set: { status: OfflineGrantStatus.EXPIRED } },
      )
      .exec();

    return this.offlineGrantModel
      .find({ patronId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async revokeGrant(grantId: string, patronId: string): Promise<OfflineGrantDocument> {
    const grant = await this.offlineGrantModel.findById(grantId).exec();
    if (!grant) {
      throw new ResourceNotFoundException(
        'Offline grant not found',
        ErrorCode.RES_OFFLINE_GRANT_NOT_FOUND,
      );
    }

    if (grant.patronId !== patronId) {
      throw new ForbiddenDomainException(
        'You can only revoke your own offline grants',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    if (grant.status !== OfflineGrantStatus.ACTIVE) {
      throw new ResourceConflictException(
        'Offline grant is not active',
        ErrorCode.BIZ_OFFLINE_GRANT_INACTIVE,
      );
    }

    const updated = await this.offlineGrantModel
      .findOneAndUpdate(
        { _id: grant._id, status: OfflineGrantStatus.ACTIVE },
        { $set: { status: OfflineGrantStatus.REVOKED, revokedAt: new Date() } },
        { new: true },
      )
      .exec();
    return updated as OfflineGrantDocument;
  }

  async authorizeDownload(
    patronId: string,
    grantToken: string,
    deviceId: string,
  ): Promise<OfflineAuthorization> {
    const grant = await this.offlineGrantModel.findOne({ grantToken }).exec();
    if (!grant) {
      this.deny();
    }

    const now = new Date();
    if (grant!.status !== OfflineGrantStatus.ACTIVE) {
      this.deny();
    }
    if (grant!.patronId !== patronId) {
      this.deny();
    }
    if (hashDeviceId(deviceId) !== grant!.deviceIdHash) {
      this.deny();
    }

    const grantExpired = grant!.expiresAt.getTime() <= now.getTime();
    if (grantExpired) {
      await this.offlineGrantModel
        .updateOne(
          { _id: grant!._id, status: OfflineGrantStatus.ACTIVE },
          { $set: { status: OfflineGrantStatus.EXPIRED } },
        )
        .exec();
      this.deny();
    }

    const loan = await this.digitalLoanModel.findById(grant!.loanId).exec();
    if (!loan) {
      this.deny();
    }
    if (
      loan!.status !== DigitalLoanStatus.ACTIVE ||
      loan!.accessRevoked ||
      loan!.expiresAt.getTime() <= now.getTime()
    ) {
      this.deny();
    }

    return {
      valid: true,
      patronId,
      loanId: String(grant!.loanId),
      editionId: grant!.editionId,
      renditionId: grant!.renditionId,
      expiresAt: grant!.expiresAt,
    };
  }

  private deny(): never {
    throw new ForbiddenDomainException(
      'Offline download authorization denied',
      ErrorCode.BIZ_OFFLINE_DOWNLOAD_DENIED,
    );
  }
}