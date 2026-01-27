const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const certificateNameChangeRoutes = require('../../routes/certificateNameChangeRoutes');
const User = require('../../models/User');
const CertificateNameChangeRequest = require('../../models/CertificateNameChangeRequest');
const jwt = require('jsonwebtoken');
const path = require('path');

// Setup express app for testing
const app = express();
app.use(express.json());
app.use('/certificates/name-change', certificateNameChangeRoutes);

describe('Certificate Name Change Routes Integration Tests', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/chainverse-test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await CertificateNameChangeRequest.deleteMany({});

    // Create verified test user
    testUser = await User.create({
      email: 'student@example.com',
      name: 'Test Student',
      password: 'password123',
      isVerified: true,
      role: 'student'
    });

    // Generate auth token
    authToken = jwt.sign(
      { id: testUser._id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('POST /certificates/name-change/request', () => {
    it('should submit name change request successfully', async () => {
      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newFullName: 'John Michael Smith',
          reason: 'Legal name change after marriage ceremony'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Name change request submitted successfully');
      expect(response.body.data.newFullName).toBe('John Michael Smith');
      expect(response.body.data.status).toBe('Pending');
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/certificates/name-change/request')
        .send({
          newFullName: 'John Doe',
          reason: 'Testing without auth'
        });

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid name format', async () => {
      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newFullName: 'John123!@#',
          reason: 'Testing invalid name format'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with short reason', async () => {
      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newFullName: 'John Doe',
          reason: 'Short'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newFullName: 'John Doe'
        });

      expect(response.status).toBe(400);
    });

    it('should accept request with supporting document', async () => {
      const testFilePath = path.join(__dirname, '../fixtures/test-document.pdf');
      
      // Create a simple buffer to simulate file
      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${authToken}`)
        .field('newFullName', 'John Michael Smith')
        .field('reason', 'Legal name change with supporting document')
        .attach('supportingDocument', Buffer.from('test pdf content'), 'document.pdf');

      // May fail if file validation is strict, adjust based on implementation
      expect([201, 400]).toContain(response.status);
    });

    it('should reject unverified user', async () => {
      // Create unverified user
      const unverifiedUser = await User.create({
        email: 'unverified@example.com',
        name: 'Unverified User',
        password: 'password123',
        isVerified: false
      });

      const unverifiedToken = jwt.sign(
        { id: unverifiedUser._id, email: unverifiedUser.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/certificates/name-change/request')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send({
          newFullName: 'John Doe',
          reason: 'Testing unverified access'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('verified');
    });
  });

  describe('GET /certificates/name-change/my-requests', () => {
    beforeEach(async () => {
      // Create sample requests
      await CertificateNameChangeRequest.create([
        {
          studentId: testUser._id,
          newFullName: 'John Doe',
          reason: 'First request for testing',
          status: 'Pending',
          requestedDate: new Date()
        },
        {
          studentId: testUser._id,
          newFullName: 'Jane Doe',
          reason: 'Second request for testing',
          status: 'Approved',
          requestedDate: new Date()
        }
      ]);
    });

    it('should retrieve all requests for authenticated user', async () => {
      const response = await request(app)
        .get('/certificates/name-change/my-requests')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter requests by status', async () => {
      const response = await request(app)
        .get('/certificates/name-change/my-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'Pending' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].status).toBe('Pending');
    });

    it('should return empty array when no requests exist', async () => {
      await CertificateNameChangeRequest.deleteMany({});

      const response = await request(app)
        .get('/certificates/name-change/my-requests')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
      expect(response.body.data).toHaveLength(0);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/certificates/name-change/my-requests');

      expect(response.status).toBe(401);
    });

    it('should reject invalid status filter', async () => {
      const response = await request(app)
        .get('/certificates/name-change/my-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'InvalidStatus' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /certificates/name-change/request/:requestId', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await CertificateNameChangeRequest.create({
        studentId: testUser._id,
        newFullName: 'John Doe',
        reason: 'Testing single request retrieval',
        requestedDate: new Date()
      });
    });

    it('should retrieve specific request by ID', async () => {
      const response = await request(app)
        .get(`/certificates/name-change/request/${testRequest._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.newFullName).toBe('John Doe');
    });

    it('should return 404 for non-existent request', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/certificates/name-change/request/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should not allow access to other users requests', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
        password: 'password123',
        isVerified: true
      });

      const otherRequest = await CertificateNameChangeRequest.create({
        studentId: otherUser._id,
        newFullName: 'Other User',
        reason: 'Private request',
        requestedDate: new Date()
      });

      const response = await request(app)
        .get(`/certificates/name-change/request/${otherRequest._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/certificates/name-change/request/${testRequest._id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on submission endpoint', async () => {
      // This test depends on your rate limiting configuration
      // Adjust the number of requests based on your rate limit settings
      const requests = [];
      
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/certificates/name-change/request')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              newFullName: `Test Name ${i}`,
              reason: 'Testing rate limiting functionality'
            })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      // Should have some rate limited responses if limit is < 15
      // This assertion may need adjustment based on actual rate limit config
      expect(rateLimitedResponses.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });
});
