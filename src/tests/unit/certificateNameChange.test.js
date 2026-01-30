const mongoose = require('mongoose');
const CertificateNameChangeRequest = require('../../models/CertificateNameChangeRequest');
const certificateNameChangeController = require('../../controllers/certificateNameChangeController');
const User = require('../../models/User');

describe('Certificate Name Change Request Tests', () => {
  let testUserId;
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
    await CertificateNameChangeRequest.deleteMany({});
    await User.deleteMany({});
    
    // Create a test user
    testUser = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      isVerified: true,
      role: 'student'
    });
    testUserId = testUser._id;
  });

  describe('CertificateNameChangeRequest Model', () => {
    it('should create a name change request successfully', async () => {
      const validRequest = {
        studentId: testUserId,
        newFullName: 'John Michael Doe',
        reason: 'Legal name change after marriage ceremony',
        status: 'Pending',
        requestedDate: new Date()
      };

      const savedRequest = await CertificateNameChangeRequest.create(validRequest);
      
      expect(savedRequest.studentId).toEqual(testUserId);
      expect(savedRequest.newFullName).toBe(validRequest.newFullName);
      expect(savedRequest.reason).toBe(validRequest.reason);
      expect(savedRequest.status).toBe('Pending');
    });

    it('should fail to create request without required fields', async () => {
      const invalidRequest = {
        studentId: testUserId
      };

      await expect(CertificateNameChangeRequest.create(invalidRequest)).rejects.toThrow();
    });

    it('should enforce minimum length for reason field', async () => {
      const invalidRequest = {
        studentId: testUserId,
        newFullName: 'John Doe',
        reason: 'Short',
        requestedDate: new Date()
      };

      await expect(CertificateNameChangeRequest.create(invalidRequest)).rejects.toThrow();
    });

    it('should default status to Pending', async () => {
      const request = await CertificateNameChangeRequest.create({
        studentId: testUserId,
        newFullName: 'Jane Smith',
        reason: 'Correcting spelling error on certificate',
        requestedDate: new Date()
      });

      expect(request.status).toBe('Pending');
    });

    it('should only allow valid status values', async () => {
      const request = await CertificateNameChangeRequest.create({
        studentId: testUserId,
        newFullName: 'Jane Smith',
        reason: 'Legal name update after court order',
        status: 'Pending',
        requestedDate: new Date()
      });

      request.status = 'InvalidStatus';
      await expect(request.save()).rejects.toThrow();
    });

    it('should store supporting document URL when provided', async () => {
      const request = await CertificateNameChangeRequest.create({
        studentId: testUserId,
        newFullName: 'Jane Smith',
        reason: 'Legal name update with documentation',
        supportingDocumentUrl: 'https://example.com/doc.pdf',
        requestedDate: new Date()
      });

      expect(request.supportingDocumentUrl).toBe('https://example.com/doc.pdf');
    });
  });

  describe('Controller - submitNameChangeRequest', () => {
    it('should submit request successfully for verified user', async () => {
      const req = {
        user: { _id: testUserId },
        body: {
          newFullName: 'John Michael Doe',
          reason: 'Legal name change after marriage'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.submitNameChangeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Name change request submitted successfully',
          data: expect.objectContaining({
            newFullName: 'John Michael Doe',
            status: 'Pending'
          })
        })
      );
    });

    it('should reject request for unverified user', async () => {
      // Create unverified user
      const unverifiedUser = await User.create({
        email: 'unverified@example.com',
        name: 'Unverified User',
        password: 'password123',
        isVerified: false
      });

      const req = {
        user: { _id: unverifiedUser._id },
        body: {
          newFullName: 'New Name',
          reason: 'Testing unverified access'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.submitNameChangeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Only verified student accounts can request name changes'
        })
      );
    });

    it('should handle file upload with supporting document', async () => {
      const req = {
        user: { _id: testUserId },
        body: {
          newFullName: 'John Michael Doe',
          reason: 'Legal name change with documentation'
        },
        file: {
          path: '/uploads/doc-123.pdf',
          location: 'https://s3.amazonaws.com/bucket/doc-123.pdf'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.submitNameChangeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      
      // Verify document URL was stored
      const savedRequest = await CertificateNameChangeRequest.findOne({ studentId: testUserId });
      expect(savedRequest.supportingDocumentUrl).toBeTruthy();
    });
  });

  describe('Controller - getMyNameChangeRequests', () => {
    it('should retrieve all requests for a student', async () => {
      // Create multiple requests
      await CertificateNameChangeRequest.create([
        {
          studentId: testUserId,
          newFullName: 'John Doe',
          reason: 'First request for name change',
          requestedDate: new Date()
        },
        {
          studentId: testUserId,
          newFullName: 'Jane Doe',
          reason: 'Second request for name change',
          requestedDate: new Date()
        }
      ]);

      const req = {
        user: { _id: testUserId },
        query: {}
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getMyNameChangeRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 2,
          data: expect.any(Array)
        })
      );
    });

    it('should filter requests by status', async () => {
      // Create requests with different statuses
      await CertificateNameChangeRequest.create([
        {
          studentId: testUserId,
          newFullName: 'John Doe',
          reason: 'Pending request',
          status: 'Pending',
          requestedDate: new Date()
        },
        {
          studentId: testUserId,
          newFullName: 'Jane Doe',
          reason: 'Approved request',
          status: 'Approved',
          requestedDate: new Date()
        }
      ]);

      const req = {
        user: { _id: testUserId },
        query: { status: 'Pending' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getMyNameChangeRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.count).toBe(1);
      expect(responseData.data[0].status).toBe('Pending');
    });

    it('should return empty array when no requests exist', async () => {
      const req = {
        user: { _id: testUserId },
        query: {}
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getMyNameChangeRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 0,
          data: []
        })
      );
    });
  });

  describe('Controller - getNameChangeRequestById', () => {
    it('should retrieve a specific request by ID', async () => {
      const request = await CertificateNameChangeRequest.create({
        studentId: testUserId,
        newFullName: 'John Doe',
        reason: 'Testing single request retrieval',
        requestedDate: new Date()
      });

      const req = {
        user: { _id: testUserId },
        params: { requestId: request._id.toString() }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getNameChangeRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            newFullName: 'John Doe'
          })
        })
      );
    });

    it('should return 404 when request not found', async () => {
      const req = {
        user: { _id: testUserId },
        params: { requestId: new mongoose.Types.ObjectId().toString() }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getNameChangeRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Name change request not found'
        })
      );
    });

    it('should not allow access to other students requests', async () => {
      const otherUser = await User.create({
        email: 'other@example.com',
        name: 'Other User',
        password: 'password123',
        isVerified: true
      });

      const request = await CertificateNameChangeRequest.create({
        studentId: otherUser._id,
        newFullName: 'Other User Name',
        reason: 'Private request',
        requestedDate: new Date()
      });

      const req = {
        user: { _id: testUserId },
        params: { requestId: request._id.toString() }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await certificateNameChangeController.getNameChangeRequestById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
