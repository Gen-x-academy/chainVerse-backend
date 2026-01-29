const mongoose = require('mongoose');
const CourseModeratorController = require('../../controllers/courseModeratorController');
const CourseModeratorAssignment = require('../../models/CourseModeratorAssignment');
const CourseModeratorReport = require('../../models/CourseModeratorReport');
const Course = require('../../models/course');
const User = require('../../models/User');
const NotificationService = require('../../services/notificationService');

describe('CourseModeratorController Tests', () => {
  let mockReq, mockRes, mockUser, mockCourse, mockModerator;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/test');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await CourseModeratorAssignment.deleteMany({});
    await CourseModeratorReport.deleteMany({});
    await Course.deleteMany({});
    await User.deleteMany({});

    mockUser = {
      _id: new mongoose.Types.ObjectId(),
      role: 'admin'
    };

    mockCourse = await new Course({
      title: 'Test Course',
      description: 'Test Description',
      tutor: new mongoose.Types.ObjectId(),
      tutorEmail: 'tutor@test.com',
      tutorName: 'Test Tutor'
    }).save();

    mockModerator = await new User({
      email: 'moderator@test.com',
      password: 'password',
      fullName: 'Test Moderator',
      role: 'moderator'
    }).save();

    mockReq = {
      user: mockUser,
      body: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    jest.spyOn(NotificationService, 'createCourseUpdateNotification').mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignModerator', () => {
    it('should assign moderator successfully', async () => {
      mockReq.body = {
        courseId: mockCourse._id,
        moderatorId: mockModerator._id
      };

      await CourseModeratorController.assignModerator(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Moderator assigned successfully'
        })
      );

      const assignment = await CourseModeratorAssignment.findOne({
        courseId: mockCourse._id,
        moderatorId: mockModerator._id
      });
      expect(assignment).toBeTruthy();
    });

    it('should return error if course not found', async () => {
      mockReq.body = {
        courseId: new mongoose.Types.ObjectId(),
        moderatorId: mockModerator._id
      };

      await CourseModeratorController.assignModerator(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Course not found'
        })
      );
    });

    it('should return error if moderator not found', async () => {
      mockReq.body = {
        courseId: mockCourse._id,
        moderatorId: new mongoose.Types.ObjectId()
      };

      await CourseModeratorController.assignModerator(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Moderator not found or invalid role'
        })
      );
    });
  });

  describe('getAssignedCourses', () => {
    it('should retrieve assigned courses', async () => {
      await new CourseModeratorAssignment({
        courseId: mockCourse._id,
        moderatorId: mockModerator._id,
        assignedBy: mockUser._id
      }).save();

      mockReq.query = { moderatorId: mockModerator._id.toString() };

      await CourseModeratorController.getAssignedCourses(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Assigned courses retrieved successfully',
          data: expect.objectContaining({
            courses: expect.any(Array),
            total: 1
          })
        })
      );
    });
  });

  describe('reportIssue', () => {
    beforeEach(async () => {
      await new CourseModeratorAssignment({
        courseId: mockCourse._id,
        moderatorId: mockModerator._id,
        assignedBy: mockUser._id
      }).save();

      mockReq.user = { _id: mockModerator._id, role: 'moderator' };
    });

    it('should report issue successfully', async () => {
      mockReq.body = {
        courseId: mockCourse._id,
        issueType: 'Content Issue',
        description: 'Test issue description'
      };

      await CourseModeratorController.reportIssue(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Issue reported successfully'
        })
      );

      const report = await CourseModeratorReport.findOne({
        courseId: mockCourse._id,
        reportedBy: mockModerator._id
      });
      expect(report).toBeTruthy();
      expect(report.issueType).toBe('Content Issue');
    });
  });

  describe('getReports', () => {
    it('should retrieve reports', async () => {
      await new CourseModeratorReport({
        courseId: mockCourse._id,
        reportedBy: mockModerator._id,
        issueType: 'Technical Issue',
        description: 'Test report'
      }).save();

      await CourseModeratorController.getReports(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Reports retrieved successfully',
          data: expect.objectContaining({
            reports: expect.any(Array),
            totalReports: 1
          })
        })
      );
    });
  });

  describe('respondToConcern', () => {
    let mockStudent;

    beforeEach(async () => {
      mockStudent = await new User({
        email: 'student@test.com',
        password: 'password',
        fullName: 'Test Student',
        role: 'student'
      }).save();

      mockCourse.enrollments = [{ student: mockStudent._id }];
      await mockCourse.save();

      await new CourseModeratorAssignment({
        courseId: mockCourse._id,
        moderatorId: mockModerator._id,
        assignedBy: mockUser._id
      }).save();

      mockReq.user = { _id: mockModerator._id, role: 'moderator' };
    });

    it('should respond to student concern successfully', async () => {
      mockReq.body = {
        courseId: mockCourse._id,
        studentId: mockStudent._id,
        message: 'Test response message'
      };

      await CourseModeratorController.respondToConcern(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Response sent successfully'
        })
      );
    });
  });
});