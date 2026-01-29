const express = require('express');
const router = express.Router();
const isAdmin = require('../middlewares/admin');
const auth = require('./../middlewares/auth');
const {
	publicRateLimitMiddleware,
} = require('../middlewares/rateLimitMiddleware');

const courseController = require('../controllers/courseController');
const adminCourseController = require('../controllers/courseController'); // New admin controller
const courseModeratorController = require('../controllers/courseModeratorController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const {
	completeCourse,
	getCertificateById,
} = require('../controllers/certificateController');
const { mintNft } = require('../controllers/nftController');
const bookController = require('../controllers/bookController');

//console.log("adminCourseController:", adminCourseController);

router.post('/courses', auth.authenticate, isAdmin.ensureAdmin, courseController.createCourse);
router.post('/:id/complete', auth.authenticate, completeCourse);
router.get('/:id/certificate', auth.authenticate, getCertificateById);
router.post('/:id/mint-nft', auth.authenticate, mintNft);
//router.get('/courses/public', publicRateLimitMiddleware, courseController.getPublicCourses);

// Course Retrieval & Review
router.get(
	'/admin/courses',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.getAllCourses
);
router.get(
	'/admin/course/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.getCourseById
);
router.post(
	'/admin/course/review/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.reviewCourse
);

// Course Status Management
router.patch(
	'/admin/course/publish/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.publishCourse
);
router.patch(
	'/admin/course/unpublish/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.unpublishCourse
);
router.delete(
	'/admin/course/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.deleteCourse
);

// Course Moderation & Updates
router.patch(
	'/admin/course/update/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.updateCourse
);
router.get(
	'/admin/course/enrollments/:id',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.getCourseEnrollments
);

// Admin Course Creation
router.post(
	'/admin/course',
	auth.authenticate,
	auth.hasRole(['admin']),
	adminCourseController.createCourse
);

// Course Moderator Routes
router.post(
	'/moderator/assign',
	auth.authenticate,
	auth.hasRole(['admin']),
	courseModeratorController.assignModerator
);

router.get(
	'/moderator/courses',
	auth.authenticate,
	courseModeratorController.getAssignedCourses
);

router.get(
	'/moderator/activity',
	auth.authenticate,
	courseModeratorController.getCourseActivity
);

router.post(
	'/moderator/report-issue',
	auth.authenticate,
	courseModeratorController.reportIssue
);

router.get(
	'/moderator/reports',
	auth.authenticate,
	courseModeratorController.getReports
);

router.post(
	'/moderator/respond',
	auth.authenticate,
	courseModeratorController.respondToConcern
);

// Book Assignment Routes
router.get(
	'/:id/books',
	auth.authenticate,
	bookController.getCourseBooks
);

router.post(
	'/:id/books',
	auth.authenticate,
	auth.hasRole(['admin', 'tutor']),
	bookController.assignBookToCourse
);

module.exports = router;
