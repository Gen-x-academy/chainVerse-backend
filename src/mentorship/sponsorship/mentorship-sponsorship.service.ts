import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CreateSponsorshipDto,
  ReserveSponsorshipDto,
} from './dto/sponsorship.dto';
import {
  MentorshipSponsorship,
  MentorshipSponsorshipDocument,
  SponsorshipReservation,
  SponsorshipReservationDocument,
  ReservationStatus,
  SponsorshipStatus,
} from './schemas/sponsorship.schema';

@Injectable()
export class MentorshipSponsorshipService {
  constructor(
    @InjectModel(MentorshipSponsorship.name)
    private readonly sponsorships: Model<MentorshipSponsorshipDocument>,
    @InjectModel(SponsorshipReservation.name)
    private readonly reservations: Model<SponsorshipReservationDocument>,
  ) {}

  async create(dto: CreateSponsorshipDto) {
    return this.sponsorships.create({
      ...dto,
      reservedAmount: 0,
      spentAmount: 0,
      status: SponsorshipStatus.ACTIVE,
    });
  }

  async reserve(sponsorshipId: string, dto: ReserveSponsorshipDto) {
    const existing = await this.reservations
      .findOne({ sponsorshipId, idempotencyKey: dto.idempotencyKey })
      .exec();
    if (existing) return existing;
    const updated = await this.sponsorships
      .findOneAndUpdate(
        {
          _id: sponsorshipId,
          status: SponsorshipStatus.ACTIVE,
          $expr: {
            $gte: [
              {
                $subtract: [
                  '$totalBudget',
                  { $add: ['$reservedAmount', '$spentAmount'] },
                ],
              },
              dto.amount,
            ],
          },
        },
        { $inc: { reservedAmount: dto.amount } },
        { new: true },
      )
      .exec();
    if (!updated)
      throw new BadRequestException('SPONSORSHIP_LIMIT_EXCEEDED_OR_INACTIVE');
    return this.reservations.create({
      sponsorshipId,
      engagementId: dto.engagementId,
      amount: dto.amount,
      status: ReservationStatus.RESERVED,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  async release(reservationId: string) {
    const res = await this.reservations.findById(reservationId).exec();
    if (!res) throw new NotFoundException('RESERVATION_NOT_FOUND');
    if (res.status !== ReservationStatus.RESERVED) return res;
    res.status = ReservationStatus.RELEASED;
    await res.save();
    await this.sponsorships
      .findByIdAndUpdate(res.sponsorshipId, {
        $inc: { reservedAmount: -res.amount },
      })
      .exec();
    return res;
  }

  async report(sponsorshipId: string, actorId: string) {
    const sp = await this.sponsorships.findById(sponsorshipId).exec();
    if (!sp) throw new NotFoundException('SPONSORSHIP_NOT_FOUND');
    if (sp.sponsorId !== actorId)
      throw new ForbiddenException('SPONSORSHIP_REPORT_FORBIDDEN');
    const reservations = await this.reservations.find({ sponsorshipId }).exec();
    const settled = reservations
      .filter((r) => r.status === ReservationStatus.SETTLED)
      .reduce((s, r) => s + r.amount, 0);
    return {
      sponsorshipId,
      totalBudget: sp.totalBudget,
      reservedAmount: sp.reservedAmount,
      spentAmount: sp.spentAmount,
      settledTotal: settled,
      remaining: sp.totalBudget - sp.reservedAmount - sp.spentAmount,
    };
  }
}
