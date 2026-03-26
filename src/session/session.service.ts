import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findByUserId(userId: string): Promise<Session[]> {
    return this.sessionModel.find({ userId }).exec();
  }

  async findOne(id: string): Promise<SessionDocument> {
    const session = await this.sessionModel.findById(id).exec();
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async invalidate(id: string): Promise<Session> {
    const session = await this.sessionModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.sessionModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Session not found');
    }
    return { id, deleted: true };
  }
}
