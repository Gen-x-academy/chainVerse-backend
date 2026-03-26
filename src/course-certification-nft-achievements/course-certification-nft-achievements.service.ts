import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateCourseCertificationNftAchievementsDto } from './dto/create-course-certification-nft-achievements.dto';
import { UpdateCourseCertificationNftAchievementsDto } from './dto/update-course-certification-nft-achievements.dto';
import { DomainEvents } from '../events/event-names';
import { CertificateIssuedPayload } from '../events/payloads/certificate-issued.payload';

@Injectable()
export class CourseCertificationNftAchievementsService {
  private readonly items: Array<
    { id: string } & CreateCourseCertificationNftAchievementsDto
  > = [];

  constructor(private readonly eventEmitter: EventEmitter2) {}

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException(
        'CourseCertificationNftAchievements item not found',
      );
    }
    return item;
  }

  create(payload: CreateCourseCertificationNftAchievementsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);

    this.eventEmitter.emit(
      DomainEvents.CERTIFICATE_ISSUED,
      Object.assign(new CertificateIssuedPayload(), {
        certificateId: created.id,
        studentId: payload.studentId,
        courseTitle: payload.title,
      }),
    );

    return created;
  }

  update(id: string, payload: UpdateCourseCertificationNftAchievementsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException(
        'CourseCertificationNftAchievements item not found',
      );
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
