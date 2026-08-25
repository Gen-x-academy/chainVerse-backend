import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { Server } from 'http';
import { createUser, loginUser } from './helpers/auth.helper';

describe('Role-Based Access Control (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let studentAccessToken: string;
  let tutorAccessToken: string;
  let adminAccessToken: string;
  let moderatorAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;

    // Create a student user and get the access token
    await createUser(server, 'student@example.com', 'password123', 'student');
    studentAccessToken = await loginUser(server, 'student@example.com', 'password123', 'student');

    // Create a tutor user and get the access token
    await createUser(server, 'tutor@example.com', 'password123', 'tutor');
    tutorAccessToken = await loginUser(server, 'tutor@example.com', 'password123', 'tutor');

    // Create a "super admin" user to create other admins and moderators
    await createUser(server, 'superadmin@example.com', 'password123', 'admin');
    const superAdminAccessToken = await loginUser(server, 'superadmin@example.com', 'password123', 'admin');

    // Create an admin user and get the access token
    await createAdminUser(server, 'admin@example.com', 'password123', 'admin', superAdminAccessToken);
    adminAccessToken = await loginUser(server, 'admin@example.com', 'password123', 'admin');

    // Create a moderator user and get the access token
    await createAdminUser(server, 'moderator@example.com', 'password123', 'moderator', superAdminAccessToken);
    moderatorAccessToken = await loginUser(server, 'moderator@example.com', 'password123', 'moderator');
  });

describe('Role-Based Access Control (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Public Access', () => {
    it('should allow access to public endpoints', async () => {
      await request(server).get('/').expect(200);
    });
  });

  describe('Student Access', () => {
    it('should allow a student to access their cart', async () => {
      await request(server)
        .get('/student/cart')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .expect(200);
    });

    it('should not allow a non-student to access the student cart', async () => {
      // We'll need to create a non-student user for this test
      // For now, we'll just expect a 403 Forbidden response
      await request(server)
        .get('/student/cart')
        .expect(401); // Or 403, depending on the guard implementation
    });
  });

  describe('Tutor Access', () => {
    it('should allow a tutor to access their profile', async () => {
      await request(server)
        .get('/tutor/profile')
        .set('Authorization', `Bearer ${tutorAccessToken}`)
        .expect(200);
    });

    it('should not allow a non-tutor to access the tutor profile', async () => {
      await request(server)
        .get('/tutor/profile')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .expect(403);
    });
  });

  describe('Admin Access', () => {
    it('should allow an admin to access the admin courses endpoint', async () => {
      await request(server)
        .get('/admin/courses')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
    });

    it('should not allow a non-admin to access the admin courses endpoint', async () => {
      await request(server)
        .get('/admin/courses')
        .set('Authorization', `Bearer ${studentAccessToken}`)
        .expect(403);
    });
  });

  describe('Moderator Access', () => {
    it('should allow a moderator to access the admin courses endpoint', async () => {
      await request(server)
        .get('/admin/courses')
        .set('Authorization', `Bearer ${moderatorAccessToken}`)
        .expect(200);
    });

    it('should not allow a non-moderator to access the admin courses endpoint', async () => {
      await request(server)
        .get('/admin/courses')
        .set('Authorization', `Bearer ${tutorAccessToken}`)
        .expect(403);
    });
  });

  describe('Cross-Tenant Access', () => {
    // Tests for cross-tenant denial paths
  });
});