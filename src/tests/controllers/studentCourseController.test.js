const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../../app');
const User = require('../../models/User');
const Student = require('../../models/student');
const Course = require('../../models/course');
const Enrollment = require('../../models/enrollment');

describe('Student Course Controller', () => {
  let testUser;
  let testStudent;
  let testTutor;
  let testCourse;
  let authToken;

  // Helper function to generate test token
  const generateTestToken = (user) => {
    return jwt.sign(
      { id: user._id, _id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'testsecret',
      { expiresIn: '1h' }
    );
  };

  // Helper function to create test course
  const createTestCourse = async (tutorId, options = {}) => {
    const course = new Course({
      title: options.title || 'Web3 Fundamentals',
      description: options.description || 'Learn the basics of Web3 development',
      tutor: tutorId,
      tutorEmail: 'tutor@test.com',
      tutorName: 'Test Tutor',
      category: options.category || 'Blockchain',
      level: options.level || 'Beginner',
      price: options.price || 100,
      isPublished: options.isPublished !== undefined ? options.isPublished : true,
      status: options.status || 'published',
      tags: options.tags || ['web3', 'blockchain', 'ethereum'],
      ...options
    });
    return await course.save();
  };

  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/chainverse-test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  beforeEach(async () => {
    // Clear all collections
    await User.deleteMany({});
    await Student.deleteMany({});
    await Course.deleteMany({});
    await Enrollment.deleteMany({});

    // Create test tutor
    testTutor = new User({
      email: 'tutor@test.com',
      password: 'password123',
      fullName: 'Test Tutor',
      role: 'tutor',
      isEmailVerified: true
    });
    await testTutor.save();

    // Create test student user
    testUser = new User({
      email: 'student@test.com',
      password: 'password123',
      fullName: 'Test Student',
      role: 'student',
      isEmailVerified: true
    });
    await testUser.save();

    // Create student record linked to user
    testStudent = new Student({
      _id: testUser._id,
      name: 'Test Student',
      email: 'student@test.com',
      enrolledCourses: [],
      completedCourses: [],
      cart: []
    });
    await testStudent.save();

    // Create test course
    testCourse = await createTestCourse(testTutor._id);

    // Generate auth token
    authToken = generateTestToken(testUser);
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Student.deleteMany({});
    await Course.deleteMany({});
    await Enrollment.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/student/learning', () => {
    it('should return empty array when student has no enrolled courses', async () => {
      const response = await request(app)
        .get('/api/student/learning')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.courses).toHaveLength(0);
      expect(response.body.data.totalCourses).toBe(0);
    });

    it('should return enrolled courses for student', async () => {
      // Enroll student in course
      await Student.updateOne(
        { _id: testUser._id },
        { $push: { enrolledCourses: testCourse._id } }
      );

      const response = await request(app)
        .get('/api/student/learning')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.courses).toHaveLength(1);
      expect(response.body.data.courses[0].title).toBe('Web3 Fundamentals');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/student/learning');

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 for non-student role', async () => {
      const tutorToken = generateTestToken(testTutor);

      const response = await request(app)
        .get('/api/student/learning')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/student/learning/:id', () => {
    it('should return course details for enrolled student', async () => {
      // Enroll student in course
      await Student.updateOne(
        { _id: testUser._id },
        { $push: { enrolledCourses: testCourse._id } }
      );

      const response = await request(app)
        .get(`/api/student/learning/${testCourse._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Web3 Fundamentals');
    });

    it('should return 403 when student is not enrolled', async () => {
      const response = await request(app)
        .get(`/api/student/learning/${testCourse._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('not enrolled');
    });

    it('should return 400 for invalid course ID', async () => {
      const response = await request(app)
        .get('/api/student/learning/invalid-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/student/all/course', () => {
    it('should return all published courses', async () => {
      const response = await request(app)
        .get('/api/student/all/course')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.courses).toHaveLength(1);
    });

    it('should filter courses by category', async () => {
      await createTestCourse(testTutor._id, {
        title: 'Smart Contracts 101',
        category: 'Smart Contracts'
      });

      const response = await request(app)
        .get('/api/student/all/course?category=Blockchain')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses).toHaveLength(1);
      expect(response.body.data.courses[0].category).toBe('Blockchain');
    });

    it('should filter courses by level', async () => {
      await createTestCourse(testTutor._id, {
        title: 'Advanced DeFi',
        level: 'Advanced'
      });

      const response = await request(app)
        .get('/api/student/all/course?level=Beginner')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses.every(c => c.level === 'Beginner')).toBe(true);
    });

    it('should handle pagination', async () => {
      // Create multiple courses
      for (let i = 0; i < 15; i++) {
        await createTestCourse(testTutor._id, { title: `Course ${i}` });
      }

      const response = await request(app)
        .get('/api/student/all/course?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses).toHaveLength(5);
      expect(response.body.data.totalPages).toBe(4); // 16 courses / 5 per page
    });

    it('should not return unpublished courses', async () => {
      await createTestCourse(testTutor._id, {
        title: 'Draft Course',
        isPublished: false,
        status: 'draft'
      });

      const response = await request(app)
        .get('/api/student/all/course')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses.every(c => c.isPublished === true)).toBe(true);
    });
  });

  describe('GET /api/student/search', () => {
    it('should search courses by title', async () => {
      await createTestCourse(testTutor._id, { title: 'Solidity Mastery' });

      const response = await request(app)
        .get('/api/student/search?searchTerm=Solidity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses.some(c => c.title.includes('Solidity'))).toBe(true);
    });

    it('should search courses by description', async () => {
      await createTestCourse(testTutor._id, {
        title: 'DeFi Course',
        description: 'Learn decentralized finance protocols'
      });

      const response = await request(app)
        .get('/api/student/search?searchTerm=decentralized')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses.length).toBeGreaterThan(0);
    });

    it('should search courses by tags', async () => {
      await createTestCourse(testTutor._id, {
        title: 'NFT Development',
        tags: ['nft', 'marketplace', 'opensea']
      });

      const response = await request(app)
        .get('/api/student/search?searchTerm=nft')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses.length).toBeGreaterThan(0);
    });

    it('should return 400 when search term is missing', async () => {
      const response = await request(app)
        .get('/api/student/search')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when search term is too short', async () => {
      const response = await request(app)
        .get('/api/student/search?searchTerm=a')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(400);
    });

    it('should return empty results for non-matching search', async () => {
      const response = await request(app)
        .get('/api/student/search?searchTerm=nonexistentcourse123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.courses).toHaveLength(0);
    });
  });

  describe('POST /api/courses/:id/purchase', () => {
    const validPaymentData = {
      transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      cryptoCurrency: 'ETH',
      amount: 0.05
    };

    it('should successfully purchase a course', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('purchased successfully');

      // Verify student is enrolled
      const updatedStudent = await Student.findById(testUser._id);
      expect(updatedStudent.enrolledCourses).toContainEqual(testCourse._id);
    });

    it('should return 400 when course is already purchased', async () => {
      // First purchase
      await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      // Second purchase attempt
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validPaymentData,
          transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('already purchased');
    });

    it('should return 404 for non-existent course', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/courses/${fakeId}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for unpublished course', async () => {
      const draftCourse = await createTestCourse(testTutor._id, {
        title: 'Draft Course',
        isPublished: false,
        status: 'draft'
      });

      const response = await request(app)
        .post(`/api/courses/${draftCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(validPaymentData);

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('not available');
    });

    it('should return 400 for missing transaction hash', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cryptoCurrency: 'ETH',
          amount: 0.05
        });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid transaction hash format', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionHash: 'invalid-hash',
          cryptoCurrency: 'ETH',
          amount: 0.05
        });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for unsupported cryptocurrency', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionHash: validPaymentData.transactionHash,
          cryptoCurrency: 'UNSUPPORTED',
          amount: 0.05
        });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/purchase`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionHash: validPaymentData.transactionHash,
          cryptoCurrency: 'ETH',
          amount: -1
        });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/courses/:id/transfer', () => {
    let recipientUser;

    beforeEach(async () => {
      // Create recipient user
      recipientUser = new User({
        email: 'recipient@test.com',
        password: 'password123',
        fullName: 'Recipient User',
        role: 'student',
        isEmailVerified: true
      });
      await recipientUser.save();

      // Enroll original student in course
      await Student.updateOne(
        { _id: testUser._id },
        { $push: { enrolledCourses: testCourse._id } }
      );
    });

    it('should successfully transfer course ownership', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientEmail: 'recipient@test.com'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('transferred successfully');
      expect(response.body.data.to).toBe('recipient@test.com');

      // Verify ownership transfer
      const senderStudent = await Student.findById(testUser._id);
      expect(senderStudent.enrolledCourses).not.toContainEqual(testCourse._id);
    });

    it('should return 403 when student does not own the course', async () => {
      // Remove course from student
      await Student.updateOne(
        { _id: testUser._id },
        { $pull: { enrolledCourses: testCourse._id } }
      );

      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientEmail: 'recipient@test.com'
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('do not own');
    });

    it('should return 404 for non-existent recipient', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientEmail: 'nonexistent@test.com'
        });

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toContain('Recipient not found');
    });

    it('should return 400 for missing recipient email', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid recipient email format', async () => {
      const response = await request(app)
        .post(`/api/courses/${testCourse._id}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientEmail: 'invalid-email'
        });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent course', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/courses/${fakeId}/transfer`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipientEmail: 'recipient@test.com'
        });

      expect(response.statusCode).toBe(404);
    });
  });
});
