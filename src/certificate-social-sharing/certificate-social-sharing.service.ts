import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCertificateSocialSharingDto } from './dto/create-certificate-social-sharing.dto';
import { UpdateCertificateSocialSharingDto } from './dto/update-certificate-social-sharing.dto';

@Injectable()
export class CertificateSocialSharingService {
  private readonly items: Array<
    { id: string } & CreateCertificateSocialSharingDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('CertificateSocialSharing item not found');
    }
    return item;
  }

  create(payload: CreateCertificateSocialSharingDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateCertificateSocialSharingDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('CertificateSocialSharing item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
