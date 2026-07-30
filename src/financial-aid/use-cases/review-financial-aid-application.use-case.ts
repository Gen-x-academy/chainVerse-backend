import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FinancialAidApplication } from '../domain/financial-aid-application.entity';
import { FinancialAidApplicationRepository } from '../domain/financial-aid-application.repository';
import { UpdateFinancialAidDto } from '../dto/update-financial-aid.dto';
import { DomainEvents } from '../../events/event-names';
import { FinancialAidApprovedPayload } from '../../events/payloads/financial-aid-approved.payload';

/**
 * Orchestrates updating and reviewing a financial-aid application.
 *
 * Emits `financial-aid.approved` exactly once when the status first transitions
 * to "approved".  The controller and repository are unaware of this side-effect.
 */
@Injectable()
export class ReviewFinancialAidApplicationUseCase {
  constructor(
    private readonly repository: FinancialAidApplicationRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    id: string,
    dto: UpdateFinancialAidDto,
  ): Promise<FinancialAidApplication> {
    const application = await this.repository.findById(id);
    if (!application) {
      throw new NotFoundException('Financial aid application not found');
    }

    const wasApproved = application.isApproved();

    application.update({ reason: dto.reason, status: dto.status });
    await this.repository.save(application);

    if (!wasApproved && application.isApproved()) {
      const payload = Object.assign(new FinancialAidApprovedPayload(), {
        applicationId: application.id,
        studentId: application.studentId,
        courseId: application.courseId,
      });
      this.eventEmitter.emit(DomainEvents.FINANCIAL_AID_APPROVED, payload);
    }

    return application;
  }
}
