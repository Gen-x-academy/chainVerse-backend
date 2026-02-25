import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';

export interface Session {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  loginTime: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SessionService {
  private readonly sessions: Session[] = [];

  create(userId: string, payload: CreateSessionDto): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      userId,
      token: payload.token,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      loginTime: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.push(session);
    return session;
  }

  findAll(): Session[] {
    return this.sessions;
  }

  findByUserId(userId: string): Session[] {
    return this.sessions.filter((s) => s.userId === userId);
  }

  findOne(id: string): Session {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  invalidate(id: string): Session {
    const session = this.findOne(id);
    session.isActive = false;
    session.updatedAt = new Date();
    return session;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.sessions.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new NotFoundException('Session not found');
    }
    this.sessions.splice(index, 1);
    return { id, deleted: true };
  }
}
