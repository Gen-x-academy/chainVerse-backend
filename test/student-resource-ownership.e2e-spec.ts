import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import { Model } from 'mongoose';
import request from 'supertest';
import appConfig from '../src/config/app.config';
import { StudentAccountSettings } from '../src/student-account-settings/schemas/student-account-settings.schema';
import { StudentAccountSettingsModule } from '../src/student-account-settings/student-account-settings.module';
import { CertificateNameChangeRequest } from '../src/student-certificate-name-change-request/schemas/certificate-name-change-request.schema';
import { StudentCertificateNameChangeRequestModule } from '../src/student-certificate-name-change-request/student-certificate-name-change-request.module';
import { makeAdminToken, makeStudentToken } from './helpers/jwt.helper';

/**
 * End-to-end coverage for #852: a valid token for one student must never reach
 * another student's records, whichever id is put in the path.
 */
describe('Student resource ownership (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let settingsModel: Model<StudentAccountSettings>;
  let requestModel: Model<CertificateNameChangeRequest>;

  const ownerToken = makeStudentToken('student-owner', 'owner@test.local');
  const attackerToken = makeStudentToken(
    'student-attacker',
    'attacker@test.local',
  );
  const adminToken = makeAdminToken();

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
        StudentAccountSettingsModule,
        StudentCertificateNameChangeRequestModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;

    settingsModel = moduleFixture.get(
      getModelToken(StudentAccountSettings.name),
    );
    requestModel = moduleFixture.get(
      getModelToken(CertificateNameChangeRequest.name),
    );
  }, 60_000);

  beforeEach(async () => {
    await Promise.all([
      settingsModel.deleteMany({}).exec(),
      requestModel.deleteMany({}).exec(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      settingsModel.deleteMany({}).exec(),
      requestModel.deleteMany({}).exec(),
    ]);
    await app.close();
  });

  describe('account settings', () => {
    const createOwned = async (): Promise<string> => {
      const res = await request(server)
        .post('/student/account-settings')
        .set(auth(ownerToken))
        .send({ language: 'en', timezone: 'Africa/Lagos' })
        .expect(201);
      return res.body._id as string;
    };

    it('stores the JWT subject as the owner, ignoring any body id', async () => {
      const res = await request(server)
        .post('/student/account-settings')
        .set(auth(ownerToken))
        .send({ language: 'fr', studentId: 'student-attacker' })
        .expect(201);

      expect(res.body.studentId).toBe('student-owner');
    });

    it("blocks another student from reading the owner's settings", async () => {
      const id = await createOwned();

      await request(server)
        .get(`/student/account-settings/${id}`)
        .set(auth(attackerToken))
        .expect(403);
    });

    it("blocks another student from updating the owner's settings", async () => {
      const id = await createOwned();

      await request(server)
        .patch(`/student/account-settings/${id}`)
        .set(auth(attackerToken))
        .send({ language: 'ru' })
        .expect(403);

      const stored = await settingsModel.findById(id).exec();
      expect(stored!.language).toBe('en');
    });

    it("blocks another student from deleting the owner's settings", async () => {
      const id = await createOwned();

      await request(server)
        .delete(`/student/account-settings/${id}`)
        .set(auth(attackerToken))
        .expect(403);

      await expect(settingsModel.countDocuments({}).exec()).resolves.toBe(1);
    });

    it('lets the owner read and update their own settings', async () => {
      const id = await createOwned();

      await request(server)
        .get(`/student/account-settings/${id}`)
        .set(auth(ownerToken))
        .expect(200);

      await request(server)
        .patch('/student/account-settings/me')
        .set(auth(ownerToken))
        .send({ language: 'fr' })
        .expect(200);

      const stored = await settingsModel.findById(id).exec();
      expect(stored!.language).toBe('fr');
    });

    it('keeps the staff listing off limits to students', async () => {
      await request(server)
        .get('/student/account-settings')
        .set(auth(ownerToken))
        .expect(403);

      await request(server)
        .get('/student/account-settings')
        .set(auth(adminToken))
        .expect(200);
    });

    it('rejects a malformed id with 400, not a cast error', async () => {
      await request(server)
        .get('/student/account-settings/not-an-id')
        .set(auth(ownerToken))
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(server).get('/student/account-settings/me').expect(401);
    });
  });

  describe('certificate name change requests', () => {
    const fileRequest = async (token = ownerToken): Promise<string> => {
      const res = await request(server)
        .post('/student/certificates/name-change-request')
        .set(auth(token))
        .send({
          currentName: 'Ada Lovlace',
          requestedName: 'Ada Lovelace',
          reason: 'Misspelled at enrollment',
        })
        .expect(201);
      return res.body._id as string;
    };

    it('files the request under the caller, not a body-supplied student', async () => {
      const res = await request(server)
        .post('/student/certificates/name-change-request')
        .set(auth(ownerToken))
        .send({
          currentName: 'Ada Lovlace',
          requestedName: 'Ada Lovelace',
          studentId: 'student-attacker',
        })
        .expect(201);

      expect(res.body.studentId).toBe('student-owner');
    });

    it("blocks another student from reading the owner's request", async () => {
      const id = await fileRequest();

      await request(server)
        .get(`/student/certificates/name-change-request/${id}`)
        .set(auth(attackerToken))
        .expect(403);
    });

    it("blocks another student from editing the owner's request", async () => {
      const id = await fileRequest();

      await request(server)
        .patch(`/student/certificates/name-change-request/${id}`)
        .set(auth(attackerToken))
        .send({ requestedName: 'Mallory' })
        .expect(403);

      const stored = await requestModel.findById(id).exec();
      expect(stored!.requestedName).toBe('Ada Lovelace');
    });

    it("blocks another student from withdrawing the owner's request", async () => {
      const id = await fileRequest();

      await request(server)
        .delete(`/student/certificates/name-change-request/${id}`)
        .set(auth(attackerToken))
        .expect(403);

      await expect(requestModel.countDocuments({}).exec()).resolves.toBe(1);
    });

    it('scopes the caller listing to their own requests', async () => {
      await fileRequest();
      await fileRequest(attackerToken);

      const res = await request(server)
        .get('/student/certificates/name-change-request/me')
        .set(auth(ownerToken))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].studentId).toBe('student-owner');
    });

    it('keeps review and the full listing staff-only', async () => {
      const id = await fileRequest();

      await request(server)
        .post(`/student/certificates/name-change-request/${id}/review`)
        .set(auth(ownerToken))
        .send({ decision: 'approved' })
        .expect(403);

      await request(server)
        .get('/student/certificates/name-change-request')
        .set(auth(ownerToken))
        .expect(403);

      await request(server)
        .post(`/student/certificates/name-change-request/${id}/review`)
        .set(auth(adminToken))
        .send({ decision: 'approved', note: 'ID checked' })
        .expect(201);

      const stored = await requestModel.findById(id).exec();
      expect(stored).toMatchObject({
        status: 'approved',
        reviewedBy: 'seed-admin-id',
      });
    });

    it('rejects a malformed id with 400', async () => {
      await request(server)
        .get('/student/certificates/name-change-request/not-an-id')
        .set(auth(ownerToken))
        .expect(400);
    });
  });
});
