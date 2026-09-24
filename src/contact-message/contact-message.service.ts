import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ContactMessage,
  ContactMessageDocument,
} from './schemas/contact-message.schema';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';
import { ContactMessageStatus } from './enums/contact-message.enums';

const VALID_TRANSITIONS: Record<ContactMessageStatus, ContactMessageStatus[]> = {
  [ContactMessageStatus.OPEN]: [ContactMessageStatus.IN_PROGRESS],
  [ContactMessageStatus.IN_PROGRESS]: [
    ContactMessageStatus.RESOLVED,
    ContactMessageStatus.OPEN,
  ],
  [ContactMessageStatus.RESOLVED]: [
    ContactMessageStatus.CLOSED,
    ContactMessageStatus.IN_PROGRESS,
  ],
  [ContactMessageStatus.CLOSED]: [],
};

const SENSITIVE_FIELDS = ['requesterEmail'] as const;

@Injectable()
export class ContactMessageService {
  constructor(
    @InjectModel(ContactMessage.name)
    private readonly contactMessageModel: Model<ContactMessageDocument>,
  ) {}

  async create(payload: CreateContactMessageDto): Promise<ContactMessage> {
    const message = new this.contactMessageModel({
      ...payload,
      status: ContactMessageStatus.OPEN,
      statusHistory: [
        {
          status: ContactMessageStatus.OPEN,
          changedBy: 'system',
          changedAt: new Date(),
          note: 'Message received',
        },
      ],
    });
    return message.save();
  }

  async findAll(): Promise<ContactMessage[]> {
    const messages = await this.contactMessageModel.find().exec();
    return messages.map((msg) => this.sanitize(msg));
  }

  async findOne(id: string): Promise<ContactMessage> {
    const message = await this.contactMessageModel.findById(id).exec();
    if (!message) {
      throw new NotFoundException('Contact message not found');
    }
    return message;
  }

  async update(
    id: string,
    payload: UpdateContactMessageDto,
    changedBy: string,
  ): Promise<ContactMessage> {
    const existing = await this.contactMessageModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    if (payload.status && payload.status !== existing.status) {
      this.validateTransition(existing.status, payload.status);
    }

    const updateData: Record<string, unknown> = { ...payload };
    const statusHistoryEntry = {
      status: payload.status ?? existing.status,
      changedBy,
      changedAt: new Date(),
      note: payload.statusNote,
    };

    const updated = await this.contactMessageModel
      .findByIdAndUpdate(
        id,
        {
          $set: updateData,
          $push: { statusHistory: statusHistoryEntry },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Contact message not found');
    }

    return updated;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.contactMessageModel
      .findByIdAndDelete(id)
      .exec();
    if (!result) {
      throw new NotFoundException('Contact message not found');
    }
    return { id, deleted: true };
  }

  private validateTransition(
    current: ContactMessageStatus,
    next: ContactMessageStatus,
  ): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from "${current}" to "${next}"`,
      );
    }
  }

  private sanitize(message: ContactMessageDocument): ContactMessage {
    const obj = message.toObject();
    for (const field of SENSITIVE_FIELDS) {
      if (obj[field]) {
        const [local, domain] = obj[field].split('@');
        obj[field] = `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
      }
    }
    return obj;
  }
}
