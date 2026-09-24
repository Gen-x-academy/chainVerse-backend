import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { snapshot } from '../../common/audit/audit-redaction';
import { ValidationDomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { CreateScholarshipAwardDto } from '../dto/create-scholarship-award.dto';
import {
  ScholarshipAward,
  ScholarshipAwardDocument,
} from '../schemas/scholarship-award.schema';
import { ScholarshipActor } from '../scholarship-actor';
import { ScholarshipAccessService } from './scholarship-access.service';

const AWARD_AUDIT_FIELDS = [
  'organizationId',
  'recipientId',
  'currency',
  'totalAmountMinor',
  'periodStart',
  'periodEnd',
  'status',
] as const;

@Injectable()
export class ScholarshipAwardService {
  constructor(
    @InjectModel(ScholarshipAward.name)
    private readonly awardModel: Model<ScholarshipAwardDocument>,
    private readonly access: ScholarshipAccessService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateScholarshipAwardDto,
    actor: ScholarshipActor,
  ): Promise<ScholarshipAwardDocument> {
    if (dto.periodStart && dto.periodEnd && dto.periodStart >= dto.periodEnd) {
      throw new ValidationDomainException(
        'periodStart must be before periodEnd',
        ErrorCode.VAL_OUT_OF_RANGE,
      );
    }

    const award = await new this.awardModel({
      organizationId,
      recipientId: dto.recipientId,
      recipientWallet: dto.recipientWallet,
      title: dto.title,
      currency: dto.currency,
      totalAmountMinor: dto.totalAmountMinor,
      periodStart: dto.periodStart ?? null,
      periodEnd: dto.periodEnd ?? null,
      createdBy: actor.userId,
    }).save();

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_AWARD_CREATED,
      context: actor.audit,
      target: { type: 'scholarship_award', id: award.id },
      after: snapshot(award, AWARD_AUDIT_FIELDS),
    });

    return award;
  }

  findOne(
    organizationId: string,
    awardId: string,
  ): Promise<ScholarshipAwardDocument> {
    return this.access.requireAward(organizationId, awardId);
  }

  findByOrganization(organizationId: string): Promise<ScholarshipAward[]> {
    return this.awardModel
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
  }
}
