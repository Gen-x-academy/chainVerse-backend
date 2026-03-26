import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateFinancialAidDto } from './dto/create-financial-aid.dto';
import { UpdateFinancialAidDto } from './dto/update-financial-aid.dto';
import { DomainEvents } from '../events/event-names';
import { FinancialAidApprovedPayload } from '../events/payloads/financial-aid-approved.payload';

export interface FinancialAidApplication {
  id: string;
  studentId: string;
  courseId: string;
  reason: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FinancialAidService {
  private readonly applications: FinancialAidApplication[] = [];

  constructor(private readonly eventEmitter: EventEmitter2) {}

  create(payload: CreateFinancialAidDto): FinancialAidApplication {
    const application: FinancialAidApplication = {
      id: crypto.randomUUID(),
      studentId: payload.studentId,
      courseId: payload.courseId,
      reason: payload.reason,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.applications.push(application);
    return application;
  }

  findAll(): FinancialAidApplication[] {
    return this.applications;
  }

  findByStudentId(studentId: string): FinancialAidApplication[] {
    return this.applications.filter((app) => app.studentId === studentId);
  }

  findOne(id: string): FinancialAidApplication {
    const application = this.applications.find((app) => app.id === id);
    if (!application) {
      throw new NotFoundException('Financial aid application not found');
    }
    return application;
  }

  update(id: string, payload: UpdateFinancialAidDto): FinancialAidApplication {
    const application = this.findOne(id);
    const wasApproved = application.status === 'approved';
    if (payload.reason !== undefined) application.reason = payload.reason;
    if (payload.status !== undefined) application.status = payload.status;
    application.updatedAt = new Date();

    if (!wasApproved && application.status === 'approved') {
      this.eventEmitter.emit(
        DomainEvents.FINANCIAL_AID_APPROVED,
        Object.assign(new FinancialAidApprovedPayload(), {
          applicationId: application.id,
          studentId: application.studentId,
          courseId: application.courseId,
        }),
      );
    }

    return application;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.applications.findIndex((app) => app.id === id);
    if (index === -1) {
      throw new NotFoundException('Financial aid application not found');
    }
    this.applications.splice(index, 1);
    return { id, deleted: true };
  }
}
