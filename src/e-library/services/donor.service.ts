import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Donor, DonorDocument, AcknowledgmentStatus } from '../schemas/donor.schema';
import { Donation, DonationDocument, DonationStatus } from '../schemas/donation.schema';
import { CreateDonorDto, CreateDonationDto } from '../dto/donor.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { ResourceNotFoundException } from '../../common/errors/domain.exception';

@Injectable()
export class DonorService {
  constructor(
    @InjectModel(Donor.name)
    private readonly donorModel: Model<DonorDocument>,
    @InjectModel(Donation.name)
    private readonly donationModel: Model<DonationDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async createDonor(dto: CreateDonorDto): Promise<Donor> {
    const donor = await new this.donorModel({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      organization: dto.organization,
      consentPreferences: dto.consentPreferences ?? [],
      acknowledgmentName: dto.acknowledgmentName,
      allowPublicAcknowledgment: dto.allowPublicAcknowledgment ?? false,
      notes: dto.notes,
    }).save();
    return donor;
  }

  async getDonor(donorId: string): Promise<DonorDocument> {
    const donor = await this.donorModel.findById(donorId).exec();
    if (!donor) {
      throw new ResourceNotFoundException('Donor not found', ErrorCode.RES_NOT_FOUND);
    }
    return donor;
  }

  async listDonors(paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.donorModel, paginationDto);
  }

  async createDonation(dto: CreateDonationDto, receivedBy: string): Promise<Donation> {
    await this.getDonor(dto.donorId);

    const donation = await new this.donationModel({
      donorId: dto.donorId,
      bookId: dto.bookId,
      titles: dto.titles,
      quantity: dto.quantity ? parseInt(dto.quantity, 10) : dto.titles.length,
      valuationNote: dto.valuationNote,
      restrictions: dto.restrictions,
      provenanceNotes: dto.provenanceNotes ?? [],
      status: DonationStatus.OFFERED,
      receivedBy,
      receivedAt: new Date(),
    }).save();

    return donation;
  }

  async updateDonationStatus(donationId: string, status: DonationStatus): Promise<Donation> {
    const donation = await this.donationModel.findByIdAndUpdate(
      donationId,
      { $set: { status } },
      { new: true },
    ).exec();

    if (!donation) {
      throw new ResourceNotFoundException('Donation not found', ErrorCode.RES_NOT_FOUND);
    }

    return donation;
  }

  async listDonations(donorId?: string, paginationDto?: PaginationDto) {
    const filter = donorId ? { donorId } : {};
    if (paginationDto) {
      return this.paginationService.paginate(this.donationModel, paginationDto, filter);
    }
    return this.donationModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateAcknowledgment(donorId: string, status: AcknowledgmentStatus): Promise<Donor> {
    const donor = await this.donorModel.findByIdAndUpdate(
      donorId,
      { $set: { acknowledgmentStatus: status } },
      { new: true },
    ).exec();

    if (!donor) {
      throw new ResourceNotFoundException('Donor not found', ErrorCode.RES_NOT_FOUND);
    }

    return donor;
  }
}
