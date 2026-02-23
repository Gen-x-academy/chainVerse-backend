import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStudentCertificateNameChangeRequestDto } from './dto/create-student-certificate-name-change-request.dto';
import { UpdateStudentCertificateNameChangeRequestDto } from './dto/update-student-certificate-name-change-request.dto';

@Injectable()
export class StudentCertificateNameChangeRequestService {
  private readonly items: Array<{ id: string } & CreateStudentCertificateNameChangeRequestDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('StudentCertificateNameChangeRequest item not found');
    }
    return item;
  }

  create(payload: CreateStudentCertificateNameChangeRequestDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateStudentCertificateNameChangeRequestDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('StudentCertificateNameChangeRequest item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
