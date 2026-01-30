const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app'); // Adjust path as needed
const Tutor = require('../../src/models/tutors');
const { doHash } = require('../../src/utils/hashing');

let testTutor;
let tutorToken;

describe('Tutor Authentication Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Clear tutors collection
    await Tutor.deleteMany({});

    // Create a test tutor
    const hashedPassword = await doHash('Test@123', 12);
    testTutor = await Tutor.create({
      fullName: 'Test Tutor',
      email: 'testtutor@example.com',
      password: hashedPassword,
      web3Expertise: 'Blockchain Development',
      experience: 5,
      verified: true,
      role: 'tutor'
    });

    // Generate token for authenticated requests
    tutorToken = jwt.sign(
      { sub: testTutor._id, role: 'tutor' },
      process.env.JWT_ACCESS_TOKEN,
      { expiresIn: '15m' }
    );
  });

  afterAll(async () => {
    await Tutor.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Tutor Registration and Verification', () => {
    it('should register a new tutor', async () => {
      const res = await request(app)
        .post('/tutor/create')
        .send({
          fullName: 'New Tutor',
          email: 'newtutor@example.com',
          password: 'NewTutor@123',
          web3Expertise: 'Smart Contract Development',
          experience: 3
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toContain('registered successfully');
    });

    it('should not register a tutor with existing email', async () => {
      const res = await request(app)
        .post('/tutor/create')
        .send({
          fullName: 'Duplicate Tutor',
          email: 'testtutor@example.com', // Already exists
          password: 'Duplicate@123',
          web3Expertise: 'DeFi',
          experience: 2
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('fail');
    });

    // Note: Email verification test would be more complex as it requires
    // intercepting the verification code sent via email
  });

  describe('Tutor Login', () => {
    it('should login a verified tutor', async () => {
      const res = await request(app)
        .post('/tutor/login')
        .send({
          email: 'testtutor@example.com',
          password: 'Test@123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('should not login with incorrect password', async () => {
      const res = await request(app)
        .post('/tutor/login')
        .send({
          email: 'testtutor@example.com',
          password: 'WrongPassword@123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('fail');
    });

    it('should not login non-existent tutor', async () => {
      const res = await request(app)
        .post('/tutor/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test@123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('fail');
    });
  });

  describe('Tutor Authentication Middleware', () => {
    it('should access protected route with valid token', async () => {
      const res = await request(app)
        .get('/tutor/profile')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should reject access without token', async () => {
      const res = await request(app)
        .get('/tutor/profile');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Authentication required');
    });

    it('should reject access with invalid token', async () => {
      const res = await request(app)
        .get('/tutor/profile')
        .set('Authorization', 'Bearer invalidtoken');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });
  });

  describe('Password Reset Flow', () => {
    it('should initiate password reset for existing tutor', async () => {
      const res = await request(app)
        .post('/tutor/forget/password')
        .send({
          email: 'testtutor@example.com'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should not initiate password reset for non-existent tutor', async () => {
      const res = await request(app)
        .post('/tutor/forget/password')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe('fail');
    });

    // Note: Complete password reset test would require intercepting the reset token
  });
});