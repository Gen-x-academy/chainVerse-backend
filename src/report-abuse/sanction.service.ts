import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Sanction, SanctionDocument, SanctionStatus } from '../schemas/sanction.schema';
import { CreateSanctionDto } from '../dto/create-sanction.dto';
import { AppealSanctionDto } from '../dto/appeal-sanction.dto';
import { ReviewAppealDto, AppealDecision } from '../dto/review-appeal.dto';

@Injectable()
export class SanctionService {
  constructor(
    @InjectModel(Sanction.name)
    private readonly sanctionModel: Model<SanctionDocument>,
  ) {}

  async create(issuedBy: string, dto: CreateSanctionDto): Promise<Sanction> {
    const sanction = new this.sanctionModel({ ...dto, issuedBy });
    return sanction.save();
  }

  async findByUser(userId: string): Promise<Sanction[]> {
    return this.sanctionModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<SanctionDocument> {
    const sanction = await this.sanctionModel.findById(id).exec();
    if (!sanction) throw new NotFoundException('Sanction not found');
    return sanction;
  }

  async appeal(id: string, userId: string, dto: AppealSanctionDto): Promise<Sanction> {
    const sanction = await this.findOne(id);
    if (sanction.userId !== userId) {
      throw new BadRequestException('You can only appeal your own sanctions');
    }
    if (sanction.status !== SanctionStatus.ACTIVE) {
      throw new BadRequestException('Only active sanctions can be appealed');
    }
    sanction.status = SanctionStatus.APPEALED;
    sanction.appealReason = dto.appealReason;
    return sanction.save();
  }

  async reviewAppeal(id: string, reviewerId: string, dto: ReviewAppealDto): Promise<Sanction> {
    const sanction = await this.findOne(id);
    if (sanction.status !== SanctionStatus.APPEALED) {
      throw new BadRequestException('Sanction is not under appeal');
    }
    sanction.status =
      dto.decision === AppealDecision.OVERTURN
        ? SanctionStatus.OVERTURNED
        : SanctionStatus.UPHELD;
    sanction.appealReviewedBy = reviewerId;
    sanction.appealNotes = dto.notes;
    return sanction.save();
  }
}
