import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import appConfig from '../src/config/app.config';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CertificationModule } from '../src/certification/certification.module';
import { CERTIFICATE_DOWNLOAD_TOKEN_TYPE } from '../src/certification/certification.constants';
import { CertificateTx } from '../src/stellar/schemas/certificate-tx.schema';
import { SessionService } from '../src/session/session.service';
import { makeStudentToken } from './helpers/jwt.helper';
import { readResponseBody } from './helpers/response-body.helper';

describe('Certifications module smoke tests', () => {
  let app: INestApplication;
  let certTxModel: Model<CertificateTx>;
  let jwtService: JwtService;

  const certificateId = 'smoke-cert-b';
  const ownerToken = makeStudentToken('smoke-student', 'smoke@test.local');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        JwtModule.register({
          global: true,
          secret: process.env.JWT_SECRET,
          signOptions: { algorithm: 'HS256' },
        }),
        MongooseModule.forRoot(process.env.MONGO_URI as string),
        CertificationModule,
      ],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: SessionService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    certTxModel = moduleFixture.get(getModelToken(CertificateTx.name));
    jwtService = moduleFixture.get(JwtService);
  }, 60_000);

  beforeEach(async () => {
    await certTxModel.deleteMany({ certificateId }).exec();
    await certTxModel.create({
      certificateId,
      studentId: 'smoke-student',
      transactionHash: 'tx-smoke-1',
      status: 'confirmed',
    });
  });

  afterAll(async () => {
    await certTxModel.deleteMany({ certificateId }).exec();
    await app.close();
  });

  it('GET /api/v1/certification/:id/download requires a signed token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .expect(400);
  });

  it('GET /api/v1/certification/:id/download returns a file with a valid token', async () => {
    const token = jwtService.sign(
      {
        sub: 'smoke-student',
        certificateId,
        type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
      },
      { expiresIn: 3600 },
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .query({ token })
      .expect(200);

    expect(response.headers['content-disposition']).toContain(
      `certificate-${certificateId}.txt`,
    );
    expect(readResponseBody(response)).toContain(certificateId);
  });

  it('POST /api/v1/certification/:id/download-link returns a signed URL', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/certification/${certificateId}/download-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    expect(response.body.downloadUrl).toContain('token=');
  });
});
