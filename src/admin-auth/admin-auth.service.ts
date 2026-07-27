import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAdminAuthDto } from './dto/create-admin-auth.dto';
import { UpdateAdminAuthDto } from './dto/update-admin-auth.dto';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/audit-action.enum';
import {
  AuditContext,
  systemAuditContext,
} from '../common/audit/audit-context';
import { redactMetadata } from '../common/audit/audit-redaction';

const TARGET_TYPE = 'admin_account';

@Injectable()
export class AdminAuthService {
  private readonly items: Array<{ id: string } & CreateAdminAuthDto> = [];

  constructor(private readonly auditService: AuditService) {}

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('AdminAuth item not found');
    }
    return item;
  }

  async create(payload: CreateAdminAuthDto, audit?: AuditContext) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_CREATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id: created.id },
      before: null,
      after: redactMetadata({ ...created }),
    });

    return created;
  }

  async update(id: string, payload: UpdateAdminAuthDto, audit?: AuditContext) {
    const item = this.findOne(id);
    const before = redactMetadata({ ...item });

    Object.assign(item, payload);

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_UPDATED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before,
      after: redactMetadata({ ...item }),
    });

    return item;
  }

  async remove(id: string, audit?: AuditContext) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('AdminAuth item not found');
    }
    const [removed] = this.items.splice(index, 1);

    await this.auditService.record({
      action: AuditAction.ADMIN_ACCOUNT_DELETED,
      context: audit ?? systemAuditContext(),
      target: { type: TARGET_TYPE, id },
      before: redactMetadata({ ...removed }),
      after: null,
    });

    return { id, deleted: true };
  }
}
