import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoogleAuthDto } from './dto/google-auth.dto';

export interface GoogleUser {
  id: string;
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class GoogleAuthService {
  private readonly users: GoogleUser[] = [];

  register(
    payload: GoogleAuthDto,
  ): { user: GoogleUser; token: string } {
    const existing = this.users.find(
      (u) => u.googleId === payload.googleId || u.email === payload.email,
    );
    if (existing) {
      throw new ConflictException('User already registered');
    }

    const user: GoogleUser = {
      id: crypto.randomUUID(),
      googleId: payload.googleId,
      email: payload.email,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      role: 'student',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);

    return {
      user,
      token: 'mock-jwt-token-' + crypto.randomUUID(),
    };
  }

  login(
    payload: GoogleAuthDto,
  ): { user: GoogleUser; token: string } {
    const user = this.users.find((u) => u.googleId === payload.googleId);
    if (!user) {
      throw new NotFoundException('User not found. Please register first.');
    }

    user.updatedAt = new Date();

    return {
      user,
      token: 'mock-jwt-token-' + crypto.randomUUID(),
    };
  }
}
