import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAdminCertificateNameChangeReviewDto } from './dto/create-admin-certificate-name-change-review.dto';
import { UpdateAdminCertificateNameChangeReviewDto } from './dto/update-admin-certificate-name-change-review.dto';

@Injectable()
export class AdminCertificateNameChangeReviewService {
  private readonly items: Array<{ id: string } & CreateAdminCertificateNameChangeReviewDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('AdminCertificateNameChangeReview item not found');
    }
    return item;
  }

  create(payload: CreateAdminCertificateNameChangeReviewDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateAdminCertificateNameChangeReviewDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('AdminCertificateNameChangeReview item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
