import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRemovalRequestDto } from './dto/create-removal-request.dto';
import { UpdateRemovalRequestDto } from './dto/update-removal-request.dto';

export interface RemovalRequest {
  id: string;
  requestedBy: string;
  contentId: string;
  contentType: string;
  reason: string;
  status: string;
  adminNotes?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RemovalRequestService {
  private readonly requests: RemovalRequest[] = [];

  create(
    requestedBy: string,
    payload: CreateRemovalRequestDto,
  ): RemovalRequest {
    const request: RemovalRequest = {
      id: crypto.randomUUID(),
      requestedBy,
      contentId: payload.contentId,
      contentType: payload.contentType,
      reason: payload.reason,
      status: 'pending',
      metadata: payload.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.requests.push(request);
    return request;
  }

  findAll(): RemovalRequest[] {
    return this.requests;
  }

  findByUser(userId: string): RemovalRequest[] {
    return this.requests.filter((r) => r.requestedBy === userId);
  }

  findOne(id: string): RemovalRequest {
    const request = this.requests.find((r) => r.id === id);
    if (!request) {
      throw new NotFoundException('Removal request not found');
    }
    return request;
  }

  moderate(id: string, payload: UpdateRemovalRequestDto): RemovalRequest {
    const request = this.findOne(id);
    if (payload.status !== undefined) request.status = payload.status;
    if (payload.adminNotes !== undefined)
      request.adminNotes = payload.adminNotes;
    if (payload.metadata !== undefined) request.metadata = payload.metadata;
    request.updatedAt = new Date();
    return request;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.requests.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new NotFoundException('Removal request not found');
    }
    this.requests.splice(index, 1);
    return { id, deleted: true };
  }
}
