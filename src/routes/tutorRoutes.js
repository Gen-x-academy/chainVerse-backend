const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');
const tutorAuth = require('../middlewares/tutorAuth');
const tutorValidator = require('../validators/tutorValidator');
const rateLimit = require('express-rate-limit');
const tutorReportController = require('../controllers/tutorReportController');

// Rate limiting for tutor applications
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 applications per hour
  message: 'Too many applications from this IP, please try again after an hour'
});

// Rate limiting for authentication endpoints to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again after 15 minutes'
});

// Tutor application routes
// router.post('/tutor/apply', applyLimiter, tutorController.submitTutorApplication);
router.get('/admin/tutor-applications', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorController.getAllTutors);
router.get('/admin/tutor-applications/:id', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorController.getTutorById);
// router.put('/admin/tutor-applications/:id/decision', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorController.approveRejectApplication);

// Tutor authentication routes
// router.post('/tutor/create', 
//   tutorValidator.validateTutorCreation, 
//   tutorValidator.validateResults, 
//   tutorController.createTutor
// );

// router.post('/tutor/verify-email', 
//   tutorValidator.validateEmailVerification, 
//   tutorValidator.validateResults, 
//   tutorController.verifyEmail
// );

// router.post('/tutor/login', 
//   authLimiter,
//   tutorValidator.validateTutorLogin, 
//   tutorValidator.validateResults, 
//   tutorController.login
// );

// router.post('/tutor/forget/password', 
//   authLimiter,
//   tutorValidator.validateForgotPassword, 
//   tutorValidator.validateResults, 
//   tutorController.forgotPassword
// );

// router.post('/tutor/reset/password', 
//   authLimiter,
//   tutorValidator.validateResetPassword, 
//   tutorValidator.validateResults, 
//   tutorController.resetPassword
// );

// router.post('/tutor/refresh-token', tutorController.refreshToken);

// Protected tutor routes
router.get('/tutor/account', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorController.getProfile);
router.put('/tutor/account/update',
  tutorAuth.authenticateTutor,
  tutorAuth.tutorRoleCheck,
  tutorValidator.validateProfileUpdate,
  tutorValidator.validateResults,
  tutorController.updateProfile
);
router.put('/tutor/account/change-password',
  tutorAuth.authenticateTutor,
  tutorAuth.tutorRoleCheck,
  tutorValidator.validateChangePassword,
  tutorValidator.validateResults,
  tutorController.changePassword
);
router.post('/tutor/account/upload-profile-image',
  tutorAuth.authenticateTutor,
  tutorAuth.tutorRoleCheck,
  tutorController.uploadProfileImage
);

router.get('/tutor/courses/reports', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorReportController.getTutorCoursesReport);
// router.get('/tutor/courses/:courseId/reports', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorReportController.getCourseReport);
// router.get('/tutor/leaderboard', tutorAuth.authenticateTutor, tutorAuth.tutorRoleCheck, tutorReportController.getTutorRankings);

module.exports = router;
