import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSessionDto } from './dto/create-session.dto';
import { Session, SessionDocument } from './schemas/session.schema';

@Injectable()
export class SessionService {
  constructor(
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
  ) {}

  async create(userId: string, payload: CreateSessionDto): Promise<Session> {
    const session = new this.sessionModel({ userId, ...payload });
    return session.save();
  }

  async findAll(): Promise<Session[]> {
    return this.sessionModel.find().exec();
  }

  async findActiveByUserId(userId: string): Promise<Session[]> {
    return this.sessionModel
      .find({ userId, isActive: true })
      .select('-token') // Exclude token from responses
      .exec();
  }

  async findOne(id: string, userId: string): Promise<SessionDocument> {
    const session = await this.sessionModel.findById(id).exec();
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }
    return session;
  }

  async invalidate(id: string, userId: string): Promise<Session> {
    const session = await this.sessionModel.findById(id).exec();
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have access to this session');
    }
    const updatedSession = await this.sessionModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .select('-token')
      .exec();
    return updatedSession;
  }

  async invalidateAllExceptCurrent(userId: string, currentSessionId: string): Promise<{ modifiedCount: number }> {
    const result = await this.sessionModel.updateMany(
      { userId, isActive: true, _id: { $ne: currentSessionId } },
      { isActive: false }
    ).exec();
    return { modifiedCount: result.modifiedCount };
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.sessionModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Session not found');
    }
    return { id, deleted: true };
  }
}