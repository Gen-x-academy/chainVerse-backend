import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { AuditContext } from '../../common/audit/audit-context';
import {
  BusinessRuleException,
  DomainException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ScholarshipAssetStatus,
  ScholarshipAssetType,
  unsupportedAssetReason,
} from '../domain/scholarship-asset.rules';
import {
  ListScholarshipAssetsQueryDto,
  ProposeScholarshipAssetDto,
} from '../dto/scholarship-asset.dto';
import {
  ScholarshipAsset,
  ScholarshipAssetDocument,
} from '../schemas/scholarship-asset.schema';
import { ScholarshipStellarGateway } from '../stellar/scholarship-stellar.gateway';
import { PayoutWalletService } from './payout-wallet.service';

export interface TrustlineGuidance {
  asset: { code: string; issuer: string | null; network: string };
  address: string | null;
  ready: boolean;
  status:
    | 'no_verified_wallet'
    | 'account_not_found'
    | 'trustline_missing'
    | 'trustline_not_authorized'
    | 'ready';
  steps: string[];
}

/**
 * Governs which Stellar assets each program may pay out in.
 *
 * Proposals are validated before they are stored (network, code, issuer,
 * precision) so unsupported assets fail early. A proposal only becomes usable
 * once a *different* owner/admin approves it, and approval re-checks that the
 * issuer account exists on the configured network.
 */
@Injectable()
export class ScholarshipAssetService {
  constructor(
    @InjectModel(ScholarshipAsset.name)
    private readonly assetModel: Model<ScholarshipAssetDocument>,
    private readonly gateway: ScholarshipStellarGateway,
    private readonly wallets: PayoutWalletService,
    private readonly audit: AuditService,
  ) {}

  async propose(
    organizationId: string,
    dto: ProposeScholarshipAssetDto,
    actor: AuditContext,
  ): Promise<ScholarshipAssetDocument> {
    const isNative = dto.assetType === ScholarshipAssetType.NATIVE;
    const definition = {
      assetType: dto.assetType,
      code: isNative ? dto.code.toUpperCase() : dto.code,
      issuer: isNative ? null : (dto.issuer ?? null),
      decimals: dto.decimals,
      network: dto.network,
    };

    const reason = unsupportedAssetReason(definition, this.gateway.network);
    if (reason) {
      throw new BusinessRuleException(
        reason,
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED,
      );
    }

    let asset: ScholarshipAssetDocument;
    try {
      asset = await this.assetModel.create({
        organizationId,
        programId: dto.programId,
        ...definition,
        requiredConfirmations: dto.requiredConfirmations ?? null,
        status: ScholarshipAssetStatus.PROPOSED,
        proposedBy: actor.actorId,
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new ResourceConflictException(
          'This asset is already proposed or active for the program',
        );
      }
      throw err;
    }

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_ASSET_PROPOSED,
      context: actor,
      target: { type: 'scholarship_asset', id: asset.id },
      after: asset.toObject(),
    });
    return asset;
  }

  async approve(
    organizationId: string,
    assetId: string,
    actor: AuditContext,
  ): Promise<ScholarshipAssetDocument> {
    const asset = await this.findOwned(organizationId, assetId);

    if (asset.status !== ScholarshipAssetStatus.PROPOSED) {
      throw new BusinessRuleException(
        `Only proposed assets can be approved (current: ${asset.status})`,
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_NOT_ACTIVE,
      );
    }
    // Four-eyes: the proposer can never approve their own configuration.
    if (asset.proposedBy === actor.actorId) {
      throw new BusinessRuleException(
        'An asset must be approved by someone other than its proposer',
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_SELF_APPROVAL,
      );
    }

    const reason = unsupportedAssetReason(asset, this.gateway.network);
    if (reason) {
      throw new BusinessRuleException(
        reason,
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED,
      );
    }
    if (asset.issuer && !(await this.issuerExists(asset.issuer))) {
      throw new BusinessRuleException(
        `Issuer ${asset.issuer} does not exist on ${asset.network}`,
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED,
      );
    }

    const approved = await this.assetModel
      .findOneAndUpdate(
        {
          _id: asset._id,
          organizationId,
          status: ScholarshipAssetStatus.PROPOSED,
        },
        {
          $set: {
            status: ScholarshipAssetStatus.ACTIVE,
            approvedBy: actor.actorId,
            approvedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!approved) {
      throw new ResourceConflictException('Asset changed while approving');
    }

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_ASSET_APPROVED,
      context: actor,
      target: { type: 'scholarship_asset', id: approved.id },
      before: { status: asset.status },
      after: { status: approved.status, approvedBy: approved.approvedBy },
    });
    return approved;
  }

  /**
   * Disabling stops new scheduling and makes the executor skip due payments in
   * this asset. Payments already submitted continue to be tracked.
   */
  async disable(
    organizationId: string,
    assetId: string,
    reason: string,
    actor: AuditContext,
  ): Promise<ScholarshipAssetDocument> {
    const disabled = await this.assetModel
      .findOneAndUpdate(
        {
          _id: assetId,
          organizationId,
          status: {
            $in: [
              ScholarshipAssetStatus.PROPOSED,
              ScholarshipAssetStatus.ACTIVE,
            ],
          },
        },
        {
          $set: {
            status: ScholarshipAssetStatus.DISABLED,
            disabledBy: actor.actorId,
            disabledAt: new Date(),
            disabledReason: reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!disabled) {
      await this.findOwned(organizationId, assetId);
      throw new BusinessRuleException(
        'Asset is already disabled',
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_NOT_ACTIVE,
      );
    }

    await this.audit.record({
      action: AuditAction.SCHOLARSHIP_ASSET_DISABLED,
      context: actor,
      target: { type: 'scholarship_asset', id: disabled.id },
      after: { status: disabled.status },
      reason,
    });
    return disabled;
  }

  list(
    organizationId: string,
    query: ListScholarshipAssetsQueryDto,
  ): Promise<ScholarshipAssetDocument[]> {
    const filter: Record<string, unknown> = { organizationId };
    if (query.programId) filter.programId = query.programId;
    if (query.status) filter.status = query.status;
    return this.assetModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOwned(
    organizationId: string,
    assetId: string,
  ): Promise<ScholarshipAssetDocument> {
    const asset = await this.assetModel
      .findOne({ _id: assetId, organizationId })
      .exec();
    if (!asset) {
      throw new ResourceNotFoundException(
        'Scholarship asset not found',
        ErrorCode.RES_SCHOLARSHIP_ASSET_NOT_FOUND,
      );
    }
    return asset;
  }

  /** An active asset configured for the given program, or a 422. */
  async requireActiveForProgram(
    organizationId: string,
    programId: string,
    assetId: string,
  ): Promise<ScholarshipAssetDocument> {
    const asset = await this.findOwned(organizationId, assetId);
    if (
      asset.status !== ScholarshipAssetStatus.ACTIVE ||
      asset.programId !== programId
    ) {
      throw new BusinessRuleException(
        'Asset is not active for this program',
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_NOT_ACTIVE,
      );
    }
    if (asset.network !== this.gateway.network) {
      throw new BusinessRuleException(
        'Asset network no longer matches the platform network',
        ErrorCode.BIZ_SCHOLARSHIP_ASSET_UNSUPPORTED,
      );
    }
    return asset;
  }

  /**
   * Tells a recipient whether their verified payout address can receive the
   * asset, and what to do if it cannot.
   */
  async trustlineGuidance(
    organizationId: string,
    assetId: string,
    recipientId: string,
  ): Promise<TrustlineGuidance> {
    const asset = await this.findOwned(organizationId, assetId);
    const wallet = await this.wallets.findVerified(organizationId, recipientId);
    const base = {
      asset: { code: asset.code, issuer: asset.issuer, network: asset.network },
      address: wallet?.address ?? null,
    };

    if (!wallet) {
      return {
        ...base,
        ready: false,
        status: 'no_verified_wallet',
        steps: [
          'Verify a payout wallet: request a challenge, sign it in your Stellar wallet, and submit the signature.',
        ],
      };
    }

    const status = await this.gateway.trustlineStatus(wallet.address, asset);
    if (!status.accountExists) {
      return {
        ...base,
        ready: false,
        status: 'account_not_found',
        steps: [
          `Fund ${wallet.address} with at least the Stellar minimum balance (1 XLM plus 0.5 XLM per trustline) so the account exists on ${asset.network}.`,
          ...(asset.issuer ? trustlineSteps(asset.code, asset.issuer) : []),
        ],
      };
    }
    if (!status.hasTrustline) {
      return {
        ...base,
        ready: false,
        status: 'trustline_missing',
        steps: trustlineSteps(asset.code, asset.issuer!),
      };
    }
    if (!status.authorized) {
      return {
        ...base,
        ready: false,
        status: 'trustline_not_authorized',
        steps: [
          `The issuer ${asset.issuer} has not authorized your ${asset.code} trustline. Contact the program administrator; payouts resume once it is authorized.`,
        ],
      };
    }
    return { ...base, ready: true, status: 'ready', steps: [] };
  }

  private async issuerExists(issuer: string): Promise<boolean> {
    try {
      return Boolean(await this.gateway.loadAccount(issuer));
    } catch {
      throw new DomainException(
        'Could not reach the Stellar network to verify the issuer',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SYS_SERVICE_UNAVAILABLE,
      );
    }
  }
}

function trustlineSteps(code: string, issuer: string): string[] {
  return [
    `Open your Stellar wallet (e.g. Freighter or xBull) on the account you verified.`,
    `Add a trustline ("Add asset") for ${code} issued by ${issuer}. Check the issuer matches exactly — assets with the same code from other issuers are different assets.`,
    'Keep at least 0.5 XLM of extra reserve for the trustline.',
  ];
}

export function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000;
}
