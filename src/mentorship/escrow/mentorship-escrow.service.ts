import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConfirmEscrowFundingDto,
  CreateEscrowIntentDto,
} from './dto/escrow.dto';
import {
  EscrowFunding,
  EscrowFundingDocument,
  EscrowFundingStatus,
} from './schemas/escrow-funding.schema';

export interface EscrowActor {
  userId: string;
  roles?: string[];
  trusted?: boolean;
}

@Injectable()
export class MentorshipEscrowService {
  constructor(
    @InjectModel(EscrowFunding.name)
    private readonly escrows: Model<EscrowFundingDocument>,
  ) {}

  private assertTrusted(actor: EscrowActor) {
    const staff = (actor.roles ?? []).some((r) =>
      ['admin', 'moderator', 'staff'].includes(r),
    );
    if (!staff && !actor.trusted)
      throw new ForbiddenException('ESCROW_CONFIRMATION_UNTRUSTED');
  }

  async createIntent(dto: CreateEscrowIntentDto) {
    const existing = await this.escrows
      .findOne({
        agreementId: dto.agreementId,
        idempotencyKey: dto.idempotencyKey,
      })
      .exec();
    if (existing) return existing;
    return this.escrows.create({
      ...dto,
      status: EscrowFundingStatus.PENDING,
      confirmedAmount: null,
      providerRef: null,
      confirmedAt: null,
    });
  }

  async confirm(
    dto: ConfirmEscrowFundingDto,
    actor: EscrowActor,
    now = new Date(),
  ) {
    this.assertTrusted(actor);
    const record = await this.escrows
      .findOne({
        agreementId: dto.agreementId,
        idempotencyKey: dto.idempotencyKey,
      })
      .exec();
    if (!record) throw new BadRequestException('ESCROW_INTENT_NOT_FOUND');

    if (record.status === EscrowFundingStatus.CONFIRMED) return record; // replay harmless
    if (
      [EscrowFundingStatus.UNDERPAID, EscrowFundingStatus.OVERPAID].includes(
        record.status,
      )
    )
      return record;

    if (dto.amount < record.expectedAmount) {
      record.status = EscrowFundingStatus.UNDERPAID;
      record.confirmedAmount = dto.amount;
      record.providerRef = dto.providerRef;
      await record.save();
      return record;
    }
    if (dto.amount > record.expectedAmount) {
      record.status = EscrowFundingStatus.OVERPAID;
      record.confirmedAmount = dto.amount;
      record.providerRef = dto.providerRef;
      await record.save();
      return record;
    }

    record.status = EscrowFundingStatus.CONFIRMED;
    record.confirmedAmount = dto.amount;
    record.providerRef = dto.providerRef;
    record.confirmedAt = now;
    await record.save();
    return record;
  }
}
