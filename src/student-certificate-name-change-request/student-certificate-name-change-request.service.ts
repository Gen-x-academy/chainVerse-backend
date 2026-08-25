import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RequestActor,
  assertOwner,
  assertOwnerOrStaff,
  isStaff,
} from '../common/auth/resource-owner';
import { CreateStudentCertificateNameChangeRequestDto } from './dto/create-student-certificate-name-change-request.dto';
import { ReviewNameChangeRequestDto } from './dto/review-name-change-request.dto';
import { UpdateStudentCertificateNameChangeRequestDto } from './dto/update-student-certificate-name-change-request.dto';
import {
  CertificateNameChangeRequest,
  CertificateNameChangeRequestDocument,
  NameChangeStatus,
} from './schemas/certificate-name-change-request.schema';

const RESOURCE = 'certificate name change';

@Injectable()
export class StudentCertificateNameChangeRequestService {
  constructor(
    @InjectModel(CertificateNameChangeRequest.name)
    private readonly requestModel: Model<CertificateNameChangeRequestDocument>,
  ) {}

  /** Staff-only listing, optionally narrowed to one status. */
  async findAll(
    status?: NameChangeStatus,
  ): Promise<CertificateNameChangeRequestDocument[]> {
    return this.requestModel
      .find(status ? { status } : {})
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Lists the caller's own requests, scoped by the JWT subject. */
  async findMine(
    actor: RequestActor,
  ): Promise<CertificateNameChangeRequestDocument[]> {
    return this.requestModel
      .find({ studentId: actor.id })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    actor: RequestActor,
  ): Promise<CertificateNameChangeRequestDocument> {
    const request = await this.load(id);
    assertOwnerOrStaff(request.studentId, actor, RESOURCE);
    return request;
  }

  async create(
    payload: CreateStudentCertificateNameChangeRequestDto,
    actor: RequestActor,
  ): Promise<CertificateNameChangeRequestDocument> {
    const pending = await this.requestModel
      .findOne({ studentId: actor.id, status: 'pending' })
      .exec();
    if (pending) {
      throw new BadRequestException(
        'You already have a pending certificate name change request',
      );
    }

    return this.requestModel.create({
      studentId: actor.id,
      currentName: payload.currentName,
      requestedName: payload.requestedName,
      reason: payload.reason ?? null,
    });
  }

  /** Owner-only edit, and only while the request is still pending. */
  async update(
    id: string,
    payload: UpdateStudentCertificateNameChangeRequestDto,
    actor: RequestActor,
  ): Promise<CertificateNameChangeRequestDocument> {
    const request = await this.load(id);
    assertOwner(request.studentId, actor, RESOURCE);

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `A ${request.status} request can no longer be edited`,
      );
    }

    if (payload.currentName !== undefined) {
      request.currentName = payload.currentName;
    }
    if (payload.requestedName !== undefined) {
      request.requestedName = payload.requestedName;
    }
    if (payload.reason !== undefined) {
      request.reason = payload.reason ?? null;
    }

    return request.save();
  }

  /** Staff decision. Students cannot reach this path at all. */
  async review(
    id: string,
    dto: ReviewNameChangeRequestDto,
    actor: RequestActor,
  ): Promise<CertificateNameChangeRequestDocument> {
    const request = await this.load(id);

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Request has already been ${request.status}`,
      );
    }

    request.status = dto.decision;
    request.reviewedBy = actor.id;
    request.reviewedAt = new Date();
    request.decisionNote = dto.note ?? null;

    return request.save();
  }

  async remove(
    id: string,
    actor: RequestActor,
  ): Promise<{ id: string; deleted: true }> {
    const request = await this.load(id);

    if (!isStaff(actor)) {
      assertOwner(request.studentId, actor, RESOURCE);
      if (request.status !== 'pending') {
        throw new BadRequestException(
          `A ${request.status} request can no longer be withdrawn`,
        );
      }
    }

    await this.requestModel.deleteOne({ _id: request._id }).exec();
    return { id, deleted: true };
  }

  private async load(
    id: string,
  ): Promise<CertificateNameChangeRequestDocument> {
    const request = await this.requestModel.findById(id).exec();
    if (!request) {
      throw new NotFoundException(
        `Certificate name change request ${id} not found`,
      );
    }
    return request;
  }
}
