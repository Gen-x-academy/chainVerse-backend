const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');

describe('Student Account API', () => {
  let studentToken;
  let studentUser;
  let adminToken;

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/chainverse-test';
    await mongoose.connect(mongoUri);
  });

  beforeEach(async () => {
    // Clean up database
    await User.deleteMany({});

    // Create test student user
    studentUser = new User({
      email: 'student@test.com',
      password: 'password123',
      fullName: 'Test Student',
      phoneNumber: '+1234567890',
      role: 'student',
      isEmailVerified: true
    });
    await studentUser.save();

    // Create test admin user
    const adminUser = new User({
      email: 'admin@test.com',
      password: 'password123',
      fullName: 'Test Admin',
      role: 'admin'
    });
    await adminUser.save();

    // Generate tokens
    studentToken = jwt.sign(
      { id: studentUser._id, email: studentUser.email, role: 'student' },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: 'admin' },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /student/account', () => {
    it('should return student account details for authenticated student', async () => {
      const response = await request(app)
        .get('/student/account')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('student@test.com');
      expect(response.body.data.fullName).toBe('Test Student');
      expect(response.body.data.phoneNumber).toBe('+1234567890');
      expect(response.body.data).not.toHaveProperty('password');
      expect(response.body.data).not.toHaveProperty('twoFASecret');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/student/account')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-student user', async () => {
      const response = await request(app)
        .get('/student/account')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Student role required');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: 'fake@test.com', role: 'student' },
        process.env.JWT_SECRET || 'testsecret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/student/account')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('PUT /student/account/update', () => {
    it('should update student profile successfully', async () => {
      const updateData = {
        fullName: 'Updated Student Name',
        phoneNumber: '+9876543210'
      };

      const response = await request(app)
        .put('/student/account/update')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.data.fullName).toBe('Updated Student Name');
      expect(response.body.data.phoneNumber).toBe('+9876543210');
      expect(response.body.token).toBeDefined();
    });

    it('should update email and require verification', async () => {
      const updateData = {
        email: 'newemail@test.com'
      };

      const response = await request(app)
        .put('/student/account/update')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('newemail@test.com');
      expect(response.body.data.isEmailVerified).toBe(false);

      // Verify user was updated in database
      const updatedUser = await User.findById(studentUser._id);
      expect(updatedUser.email).toBe('newemail@test.com');
      expect(updatedUser.isEmailVerified).toBe(false);
    });

    it('should reject duplicate email', async () => {
      // Create another user
      const anotherUser = new User({
        email: 'another@test.com',
        password: 'password123',
        role: 'student'
      });
      await anotherUser.save();

      const updateData = {
        email: 'another@test.com'
      };

      const response = await request(app)
        .put('/student/account/update')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should validate full name format', async () => {
      const updateData = {
        fullName: '123' // Invalid name
      };

      const response = await request(app)
        .put('/student/account/update')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should validate email format', async () => {
      const updateData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .put('/student/account/update')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('PUT /student/account/change-password', () => {
    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'password123',
        newPassword: 'NewPassword123!'
      };

      const response = await request(app)
        .put('/student/account/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(passwordData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password changed successfully');

      // Verify password was changed
      const updatedUser = await User.findById(studentUser._id);
      const isOldPasswordValid = await updatedUser.comparePassword('password123');
      const isNewPasswordValid = await updatedUser.comparePassword('NewPassword123!');
      expect(isOldPasswordValid).toBe(false);
      expect(isNewPasswordValid).toBe(true);
    });

    it('should reject incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'NewPassword123!'
      };

      const response = await request(app)
        .put('/student/account/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Current password is incorrect');
    });

    it('should reject same password as current', async () => {
      const passwordData = {
        currentPassword: 'password123',
        newPassword: 'password123'
      };

      const response = await request(app)
        .put('/student/account/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('New password must be different from current password');
    });

    it('should validate new password strength', async () => {
      const passwordData = {
        currentPassword: 'password123',
        newPassword: 'weak' // Too weak
      };

      const response = await request(app)
        .put('/student/account/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should require all fields', async () => {
      const passwordData = {
        currentPassword: 'password123'
        // Missing newPassword
      };

      const response = await request(app)
        .put('/student/account/change-password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /student/account/upload-profile-image', () => {
    it('should upload profile image successfully', async () => {
      const response = await request(app)
        .post('/student/account/upload-profile-image')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('profileImage', Buffer.from('fake-image-data'), 'test.jpg')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile image uploaded successfully');
      expect(response.body.data.profileImage).toBeDefined();
      expect(response.body.data.profileImage).toContain('/uploads/profile-images/');

      // Verify user was updated in database
      const updatedUser = await User.findById(studentUser._id);
      expect(updatedUser.profileImage).toBe(response.body.data.profileImage);
    });

    it('should reject non-image files', async () => {
      const response = await request(app)
        .post('/student/account/upload-profile-image')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('profileImage', Buffer.from('fake-text-data'), 'test.txt')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Only image files');
    });

    it('should reject files that are too large', async () => {
      // Create a large buffer (6MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');

      const response = await request(app)
        .post('/student/account/upload-profile-image')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('profileImage', largeBuffer, 'large.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require file upload', async () => {
      const response = await request(app)
        .post('/student/account/upload-profile-image')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('No file uploaded');
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit password change attempts', async () => {
      const passwordData = {
        currentPassword: 'password123',
        newPassword: 'NewPassword123!'
      };

      // Make multiple requests quickly
      const promises = Array(5).fill().map(() =>
        request(app)
          .put('/student/account/change-password')
          .set('Authorization', `Bearer ${studentToken}`)
          .send(passwordData)
      );

      const responses = await Promise.all(promises);
      
      // First 3 should succeed (limit is 3 per 15 minutes)
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      expect(responses[2].status).toBe(200);
      
      // Next 2 should be rate limited
      expect(responses[3].status).toBe(429);
      expect(responses[4].status).toBe(429);
    });

    it('should rate limit profile update attempts', async () => {
      const updateData = {
        fullName: 'Updated Name'
      };

      // Make multiple requests quickly
      const promises = Array(15).fill().map(() =>
        request(app)
          .put('/student/account/update')
          .set('Authorization', `Bearer ${studentToken}`)
          .send(updateData)
      );

      const responses = await Promise.all(promises);
      
      // First 10 should succeed (limit is 10 per 10 minutes)
      for (let i = 0; i < 10; i++) {
        expect(responses[i].status).toBe(200);
      }
      
      // Next 5 should be rate limited
      for (let i = 10; i < 15; i++) {
        expect(responses[i].status).toBe(429);
      }
    });
  });
});
