const mongoose = require('mongoose');
const Certificate = require('../../models/Certificate');
const { generateVerificationHash } = require('../../controllers/certificateController');

describe('Certificate Model and Controller Tests', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Certificate.deleteMany({});
  });

  describe('Certificate Model', () => {
    it('should create a certificate successfully', async () => {
      const validCertificate = {
        studentId: new mongoose.Types.ObjectId(),
        courseId: new mongoose.Types.ObjectId(),
        certificateNumber: 'CERT-2025-001',
        pdfUrl: 'https://example.com/cert.pdf',
        metadata: {
          courseName: 'Test Course',
          studentName: 'John Doe',
          completionDate: new Date(),
          grade: 'A'
        },
        verificationHash: 'testHash123'
      };

      const savedCertificate = await new Certificate(validCertificate).save();
      expect(savedCertificate.certificateNumber).toBe(validCertificate.certificateNumber);
      expect(savedCertificate.status).toBe('ACTIVE');
    });

    it('should fail to create certificate without required fields', async () => {
      const invalidCertificate = {
        studentId: new mongoose.Types.ObjectId()
      };

      await expect(new Certificate(invalidCertificate).save()).rejects.toThrow();
    });
  });

  describe('Certificate Verification', () => {
    it('should generate consistent verification hash', () => {
      const certificate = {
        studentId: new mongoose.Types.ObjectId(),
        courseId: new mongoose.Types.ObjectId(),
        issueDate: new Date(),
        certificateNumber: 'CERT-2025-001'
      };

      const hash1 = generateVerificationHash(certificate);
      const hash2 = generateVerificationHash(certificate);

      expect(hash1).toBe(hash2);
    });
  });
});