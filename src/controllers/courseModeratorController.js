const CourseModeratorAssignment = require('../models/CourseModeratorAssignment');
const CourseModeratorReport = require('../models/CourseModeratorReport');
const Course = require('../models/course');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');

// Utility functions
const handleError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

const handleSuccess = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// POST /course/moderator/assign - Assign moderator to course (admin only)
exports.assignModerator = async (req, res) => {
  try {
    const { courseId, moderatorId } = req.body;

    if (!courseId || !moderatorId) {
      return handleError(res, 400, 'Course ID and Moderator ID are required');
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return handleError(res, 404, 'Course not found');
    }

    // Check if moderator exists and has role 'moderator'
    const moderator = await User.findById(moderatorId);
    if (!moderator || moderator.role !== 'moderator') {
      return handleError(res, 404, 'Moderator not found or invalid role');
    }

    // Check if already assigned
    const existingAssignment = await CourseModeratorAssignment.findOne({
      courseId,
      moderatorId,
      isActive: true,
    });
    if (existingAssignment) {
      return handleError(res, 400, 'Moderator already assigned to this course');
    }

    const assignment = new CourseModeratorAssignment({
      courseId,
      moderatorId,
      assignedBy: req.user._id,
    });

    await assignment.save();

    // Send notification to moderator
    await NotificationService.createCourseUpdateNotification(
      moderatorId,
      course.title,
      'info'
    );

    return handleSuccess(res, 201, 'Moderator assigned successfully', assignment);
  } catch (error) {
    console.error('Error assigning moderator:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

// GET /course/moderator/courses - Get courses for a moderator
exports.getAssignedCourses = async (req, res) => {
  try {
    const { moderatorId } = req.query;

    if (!moderatorId) {
      return handleError(res, 400, 'Moderator ID is required');
    }

    // Check if requester is the moderator or admin
    if (req.user.role !== 'admin' && req.user._id.toString() !== moderatorId) {
      return handleError(res, 403, 'Access denied');
    }

    const assignments = await CourseModeratorAssignment.find({
      moderatorId,
      isActive: true,
    }).populate('courseId', 'title description category level');

    const courses = assignments.map(assignment => assignment.courseId);

    return handleSuccess(res, 200, 'Assigned courses retrieved successfully', {
      courses,
      total: courses.length,
    });
  } catch (error) {
    console.error('Error retrieving assigned courses:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

// GET /course/moderator/activity - Get course activity data
exports.getCourseActivity = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (!courseId) {
      return handleError(res, 400, 'Course ID is required');
    }

    // Check if user is assigned moderator for this course
    const assignment = await CourseModeratorAssignment.findOne({
      courseId,
      moderatorId: req.user._id,
      isActive: true,
    });
    if (!assignment && req.user.role !== 'admin') {
      return handleError(res, 403, 'Access denied');
    }

    const course = await Course.findById(courseId)
      .populate('enrollments.student', 'name email')
      .select('title enrollments studentProgress completionDates totalEnrollments rating totalRatings');

    if (!course) {
      return handleError(res, 404, 'Course not found');
    }

    // Calculate activity metrics
    const totalEnrollments = course.totalEnrollments;
    const activeStudents = course.enrollments.filter(enrollment => {
      const progress = course.studentProgress.get(enrollment.student._id.toString());
      return progress && progress > 0;
    }).length;

    const completedStudents = course.enrollments.filter(enrollment => {
      const completionDate = course.completionDates.get(enrollment.student._id.toString());
      return completionDate;
    }).length;

    const averageProgress = totalEnrollments > 0 ?
      Array.from(course.studentProgress.values()).reduce((sum, p) => sum + p, 0) / course.studentProgress.size : 0;

    return handleSuccess(res, 200, 'Course activity retrieved successfully', {
      courseTitle: course.title,
      totalEnrollments,
      activeStudents,
      completedStudents,
      averageProgress: Math.round(averageProgress * 100) / 100,
      averageRating: course.rating,
      totalRatings: course.totalRatings,
    });
  } catch (error) {
    console.error('Error retrieving course activity:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

// POST /course/moderator/report-issue - Report an issue
exports.reportIssue = async (req, res) => {
  try {
    const { courseId, issueType, description } = req.body;

    if (!courseId || !issueType || !description) {
      return handleError(res, 400, 'Course ID, issue type, and description are required');
    }

    // Check if user is assigned moderator for this course
    const assignment = await CourseModeratorAssignment.findOne({
      courseId,
      moderatorId: req.user._id,
      isActive: true,
    });
    if (!assignment && req.user.role !== 'admin') {
      return handleError(res, 403, 'Access denied');
    }

    const report = new CourseModeratorReport({
      courseId,
      reportedBy: req.user._id,
      issueType,
      description,
    });

    await report.save();

    // Send notification to admins (assuming admins handle escalation)
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await NotificationService.createCourseUpdateNotification(
        admin._id,
        `New issue reported for course ${courseId}`,
        'warning'
      );
    }

    return handleSuccess(res, 201, 'Issue reported successfully', report);
  } catch (error) {
    console.error('Error reporting issue:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

// GET /course/moderator/reports - Get reports
exports.getReports = async (req, res) => {
  try {
    const { courseId, page = 1, limit = 10 } = req.query;

    let query = {};
    if (courseId) {
      query.courseId = courseId;
    }

    // If not admin, only show reports for assigned courses
    if (req.user.role !== 'admin') {
      const assignments = await CourseModeratorAssignment.find({
        moderatorId: req.user._id,
        isActive: true,
      }).select('courseId');
      const courseIds = assignments.map(a => a.courseId);
      query.courseId = { $in: courseIds };
    }

    const reports = await CourseModeratorReport.find(query)
      .populate('courseId', 'title')
      .populate('reportedBy', 'name email')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CourseModeratorReport.countDocuments(query);

    return handleSuccess(res, 200, 'Reports retrieved successfully', {
      reports,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalReports: total,
    });
  } catch (error) {
    console.error('Error retrieving reports:', error);
    return handleError(res, 500, 'Internal server error');
  }
};

// POST /course/moderator/respond - Respond to student concern
exports.respondToConcern = async (req, res) => {
  try {
    const { courseId, studentId, message } = req.body;

    if (!courseId || !studentId || !message) {
      return handleError(res, 400, 'Course ID, student ID, and message are required');
    }

    // Check if user is assigned moderator for this course
    const assignment = await CourseModeratorAssignment.findOne({
      courseId,
      moderatorId: req.user._id,
      isActive: true,
    });
    if (!assignment && req.user.role !== 'admin') {
      return handleError(res, 403, 'Access denied');
    }

    // Check if student is enrolled
    const course = await Course.findById(courseId);
    if (!course) {
      return handleError(res, 404, 'Course not found');
    }

    const enrollment = course.enrollments.find(e => e.student.toString() === studentId);
    if (!enrollment) {
      return handleError(res, 404, 'Student not enrolled in this course');
    }

    // Send notification to student
    await NotificationService.createCourseUpdateNotification(
      studentId,
      `Response from moderator for course ${course.title}`,
      'info'
    );

    // For now, just return success. In a real app, might store the response.
    return handleSuccess(res, 200, 'Response sent successfully');
  } catch (error) {
    console.error('Error responding to concern:', error);
    return handleError(res, 500, 'Internal server error');
  }
};