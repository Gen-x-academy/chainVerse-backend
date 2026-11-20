import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WorkspaceActivity,
  WorkspaceActivityDocument,
} from '../schemas/workspace-activity.schema';

export interface WorkspaceActivityEvent {
  tenantId: string;
  projectId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string;
}

/**
 * Background consumer for workspace activity. Runs outside the request path:
 * identities and ids only, never note content or resource bytes.
 */
@Injectable()
export class WorkspaceActivityService {
  private readonly logger = new Logger(WorkspaceActivityService.name);

  constructor(
    @InjectModel(WorkspaceActivity.name)
    private readonly activity: Model<WorkspaceActivityDocument>,
  ) {}

  @OnEvent('workspace.activity.recorded')
  async handle(event: WorkspaceActivityEvent): Promise<void> {
    try {
      await this.activity.create({
        ...event,
        requestId: event.requestId ?? null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record workspace activity action=${event.action} projectId=${event.projectId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
