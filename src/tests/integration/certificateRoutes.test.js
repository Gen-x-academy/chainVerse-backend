const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../server');
const Certificate = require('../../models/Certificate');
const { generateToken } = require('../../utils/hashing');

describe('Certificate Routes', () => {
  let authToken;
  let testStudentId;
  let testCertificateId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    testStudentId = new mongoose.Types.ObjectId();
    authToken = generateToken({ id: testStudentId });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Certificate.deleteMany({});
    
    // Create a test certificate
    const certificate = await Certificate.create({
      studentId: testStudentId,
      courseId: new mongoose.Types.ObjectId(),
      certificateNumber: 'TEST-CERT-001',
      pdfUrl: 'https://example.com/test.pdf',
      metadata: {
        courseName: 'Test Course',
        studentName: 'Test Student',
        completionDate: new Date(),
        grade: 'A'
      },
      verificationHash: 'testhash123'
    });
    testCertificateId = certificate._id;
  });

  describe('GET /certificates/my-certificates', () => {
    it('should return all certificates for authenticated student', async () => {
      const response = await request(app)
        .get('/certificates/my-certificates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].certificateNumber).toBe('TEST-CERT-001');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get('/certificates/my-certificates');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /certificates/:certificateId', () => {
    it('should return certificate if it belongs to student', async () => {
      const response = await request(app)
        .get(`/certificates/${testCertificateId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.certificateNumber).toBe('TEST-CERT-001');
    });

    it('should return 404 for non-existent certificate', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/certificates/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /certificates/my-certificates/download-all', () => {
    it('should return ZIP file with all certificates', async () => {
      const response = await request(app)
        .get('/certificates/my-certificates/download-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toContain('attachment');
    });
  });
});