export interface AuthUser {
  id: string;
  email: string;
  googleId: string;
  name: string;
  avatarUrl?: string;
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
