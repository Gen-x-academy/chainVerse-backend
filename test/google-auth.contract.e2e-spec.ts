import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { GoogleAuthService } from '../src/google-auth/google-auth.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GoogleUser,
  GoogleUserDocument,
} from '../src/google-auth/schemas/google-user.schema';

describe('Google Auth Contract (e2e)', () => {
  let app: INestApplication;
  let googleAuthService: GoogleAuthService;
  let googleUserModel: Model<GoogleUserDocument>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    googleAuthService = app.get(GoogleAuthService);
    googleUserModel = app.get<Model<GoogleUserDocument>>(
      getModelToken(GoogleUser.name),
    );
  });

  afterAll(async () => {
    await googleUserModel.deleteMany({});
    await app.close();
  });

  it('should register a new Google user', async () => {
    const googleUser = {
      googleId: '12345',
      email: 'test@google.com',
      displayName: 'Test User',
    };

    const result = await googleAuthService.register(googleUser);

    expect(result.accessToken).toBeDefined();
    expect(result.user.email).toBe(googleUser.email);

    const dbUser = await googleUserModel
      .findOne({ email: googleUser.email })
      .exec();
    expect(dbUser).toBeDefined();
  });

  it('should log in an existing Google user', async () => {
    const googleUser = {
      googleId: '12345',
      email: 'test@google.com',
      displayName: 'Test User',
    };

    const result = await googleAuthService.login(googleUser);

    expect(result.accessToken).toBeDefined();
    expect(result.user.email).toBe(googleUser.email);
  });
});
