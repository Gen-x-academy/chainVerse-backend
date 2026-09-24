import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import request from 'supertest';
import appConfig from '../src/config/app.config';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CertificationModule } from '../src/certification/certification.module';
import { CERTIFICATE_DOWNLOAD_TOKEN_TYPE } from '../src/certification/certification.constants';
import {
  CertificateTx,
  CertificateTxDocument,
} from '../src/stellar/schemas/certificate-tx.schema';
import { SessionService } from '../src/session/session.service';
import {
  makeAdminToken,
  makeStudentToken,
} from './helpers/jwt.helper';
import { readResponseBody } from './helpers/response-body.helper';

describe('Certification secure download links (e2e)', () => {
  let app: INestApplication;
  let certTxModel: Model<CertificateTxDocument>;
  let jwtService: JwtService;

  const certificateId = 'cert-e2e-001';
  const ownerToken = makeStudentToken('student-owner', 'owner@test.local');
  const attackerToken = makeStudentToken(
    'student-attacker',
    'attacker@test.local',
  );
  const adminToken = makeAdminToken();

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
      studentId: 'student-owner',
      transactionHash: 'tx-e2e-1',
      status: 'confirmed',
    });
  });

  afterAll(async () => {
    await certTxModel.deleteMany({ certificateId }).exec();
    await app.close();
  });

  it('POST /download-link returns a signed URL for the certificate owner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/certification/${certificateId}/download-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    expect(res.body.downloadUrl).toContain(
      `/api/v1/certification/${certificateId}/download?token=`,
    );
    expect(res.body.expiresIn).toBeGreaterThan(0);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('GET /download serves the file when the signed token is valid', async () => {
    const linkRes = await request(app.getHttpServer())
      .post(`/api/v1/certification/${certificateId}/download-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const token = new URL(linkRes.body.downloadUrl).searchParams.get('token');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .query({ token })
      .expect(200);

    expect(response.headers['content-disposition']).toContain(
      `certificate-${certificateId}.txt`,
    );
    expect(readResponseBody(response)).toContain(certificateId);
  });

  it('rejects download without a token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .expect(400);
  });

  it('rejects another student from creating a download link', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/certification/${certificateId}/download-link`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(403);
  });

  it('rejects expired download tokens', async () => {
    const expired = jwtService.sign(
      {
        sub: 'student-owner',
        certificateId,
        type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
      },
      { expiresIn: -1 },
    );

    await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .query({ token: expired })
      .expect(401);
  });

  it('rejects tokens bound to a different certificate id', async () => {
    const mismatched = jwtService.sign(
      {
        sub: 'student-owner',
        certificateId: 'other-certificate',
        type: CERTIFICATE_DOWNLOAD_TOKEN_TYPE,
      },
      { expiresIn: 3600 },
    );

    await request(app.getHttpServer())
      .get(`/api/v1/certification/${certificateId}/download`)
      .query({ token: mismatched })
      .expect(401);
  });

  it('allows staff to create download links', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/certification/${certificateId}/download-link`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });
});
