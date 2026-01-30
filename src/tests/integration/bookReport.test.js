const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../../app');
const BookReport = require('../../models/bookReport');
const Book = require('../../models/book');
const User = require('../../models/User');
const { generateToken } = require('../../utils/tokenHelper');

describe('Book Report API', () => {
  let userToken;
  let adminToken;
  let testUser;
  let testAdmin;
  let testBook;
  let testReport;

  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser@example.com',
      password: 'hashedpassword123',
      role: 'user'
    });
    userToken = generateToken(testUser._id);

    // Create test admin
    testAdmin = await User.create({
      firstName: 'Test',
      lastName: 'Admin',
      email: 'testadmin@example.com',
      password: 'hashedpassword123',
      role: 'admin',
      isAdmin: true
    });
    adminToken = generateToken(testAdmin._id);

    // Create test book
    testBook = await Book.create({
      title: 'Test Book',
      author: 'Test Author',
      description: 'A test book for report testing',
      reportStatus: 'active'
    });
  });

  afterAll(async () => {
    await BookReport.deleteMany({});
    await Book.deleteMany({ _id: testBook._id });
    await User.deleteMany({ _id: { $in: [testUser._id, testAdmin._id] } });
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BookReport.deleteMany({});
  });

  describe('POST /api/book-reports', () => {
    it('should submit a new book report', async () => {
      const res = await request(app)
        .post('/api/book-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookId: testBook._id.toString(),
          reason: 'outdated',
          description: 'This book contains outdated information that needs to be updated.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reportId).toBeDefined();
    });

    it('should prevent duplicate reports from same user', async () => {
      // Create first report
      await BookReport.create({
        book: testBook._id,
        reporter: testUser._id,
        reason: 'outdated',
        description: 'First report description here'
      });

      const res = await request(app)
        .post('/api/book-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookId: testBook._id.toString(),
          reason: 'copyright',
          description: 'Second report attempt from same user'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should reject report with invalid reason', async () => {
      const res = await request(app)
        .post('/api/book-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookId: testBook._id.toString(),
          reason: 'invalid_reason',
          description: 'This is a valid description for testing'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject report with short description', async () => {
      const res = await request(app)
        .post('/api/book-reports')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookId: testBook._id.toString(),
          reason: 'outdated',
          description: 'Short'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/book-reports/my-reports', () => {
    beforeEach(async () => {
      testReport = await BookReport.create({
        book: testBook._id,
        reporter: testUser._id,
        reason: 'quality_issue',
        description: 'Quality issue description for testing purposes'
      });
    });

    it('should get user own reports', async () => {
      const res = await request(app)
        .get('/api/book-reports/my-reports')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports).toHaveLength(1);
    });

    it('should filter reports by status', async () => {
      const res = await request(app)
        .get('/api/book-reports/my-reports?status=pending')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reports.every(r => r.status === 'pending')).toBe(true);
    });
  });

  describe('GET /api/book-reports/admin', () => {
    beforeEach(async () => {
      testReport = await BookReport.create({
        book: testBook._id,
        reporter: testUser._id,
        reason: 'offensive',
        description: 'Offensive content description for testing',
        priority: 'high'
      });
    });

    it('should get all reports for admin', async () => {
      const res = await request(app)
        .get('/api/book-reports/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports.length).toBeGreaterThan(0);
    });

    it('should filter reports by priority', async () => {
      const res = await request(app)
        .get('/api/book-reports/admin?priority=high')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reports.every(r => r.priority === 'high')).toBe(true);
    });

    it('should deny access to regular users', async () => {
      const res = await request(app)
        .get('/api/book-reports/admin')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/book-reports/admin/:reportId/review', () => {
    beforeEach(async () => {
      testReport = await BookReport.create({
        book: testBook._id,
        reporter: testUser._id,
        reason: 'copyright',
        description: 'Copyright issue description for testing'
      });
    });

    it('should update report status', async () => {
      const res = await request(app)
        .patch(`/api/book-reports/admin/${testReport._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          adminNotes: 'Issue has been addressed',
          resolution: 'content_updated'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.report.status).toBe('resolved');
    });

    it('should update book status when requested', async () => {
      const res = await request(app)
        .patch(`/api/book-reports/admin/${testReport._id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolution: 'book_removed',
          updateBookStatus: 'remove'
        });

      expect(res.status).toBe(200);

      const updatedBook = await Book.findById(testBook._id);
      expect(updatedBook.reportStatus).toBe('removed');
    });
  });

  describe('GET /api/book-reports/admin/stats', () => {
    beforeEach(async () => {
      await BookReport.create([
        {
          book: testBook._id,
          reporter: testUser._id,
          reason: 'outdated',
          description: 'Outdated content description one',
          status: 'pending'
        },
        {
          book: testBook._id,
          reporter: testAdmin._id,
          reason: 'copyright',
          description: 'Copyright issue description two',
          status: 'resolved'
        }
      ]);
    });

    it('should return report statistics', async () => {
      const res = await request(app)
        .get('/api/book-reports/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview).toBeDefined();
      expect(res.body.data.byReason).toBeDefined();
      expect(res.body.data.byPriority).toBeDefined();
    });
  });

  describe('DELETE /api/book-reports/admin/:reportId', () => {
    beforeEach(async () => {
      testReport = await BookReport.create({
        book: testBook._id,
        reporter: testUser._id,
        reason: 'other',
        description: 'Report to be deleted for testing'
      });
    });

    it('should delete a report', async () => {
      const res = await request(app)
        .delete(`/api/book-reports/admin/${testReport._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deletedReport = await BookReport.findById(testReport._id);
      expect(deletedReport).toBeNull();
    });
  });
});
