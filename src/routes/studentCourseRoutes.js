const express = require('express');
const router = express.Router();
const studentCourseController = require('../controllers/studentCourseController');
const auth = require('../middlewares/auth');
const { 
  validatePurchaseCourse, 
  validateTransferCourse, 
  validateSearchCourses,
  validateGetStudentLearningById,
  validatePagination
} = require('../validators/studentCourseValidator');
const { validationResult } = require('express-validator');

// Middleware to check validation results
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User Courses
/**
 * @route   GET /student/learning
 * @desc    Fetch all courses associated with the student
 * @access  Private (Students only)
 */
router.get(
  '/student/learning',
  auth.authenticate,
  auth.hasRole(['student']),
  validatePagination,
  handleValidationErrors,
  studentCourseController.getStudentLearning
);

/**
 * @route   GET /student/learning/:id
 * @desc    Fetch details for a single student course by its ID
 * @access  Private (Students only)
 */
router.get(
  '/student/learning/:id',
  auth.authenticate,
  auth.hasRole(['student']),
  validateGetStudentLearningById,
  handleValidationErrors,
  studentCourseController.getStudentLearningById
);

// Course Exploration and Management
/**
 * @route   GET /student/all/course
 * @desc    Fetch all available courses
 * @access  Private (Students only)
 */
router.get(
  '/student/all/course',
  auth.authenticate,
  auth.hasRole(['student']),
  validatePagination,
  handleValidationErrors,
  studentCourseController.getAllCourses
);

/**
 * @route   GET /student/search
 * @desc    Search for a course based on a search term
 * @access  Private (Students only)
 */
router.get(
  '/student/search',
  auth.authenticate,
  auth.hasRole(['student']),
  validateSearchCourses,
  validatePagination,
  handleValidationErrors,
  studentCourseController.searchCourses
);

// Course Purchase and Transfer
/**
 * @route   POST /courses/:id/purchase
 * @desc    Purchase a course using crypto payment
 * @access  Private (Students only)
 */
router.post(
  '/courses/:id/purchase',
  auth.authenticate,
  auth.hasRole(['student']),
  validatePurchaseCourse,
  handleValidationErrors,
  studentCourseController.purchaseCourse
);

/**
 * @route   POST /courses/:id/transfer
 * @desc    Transfer course ownership through a smart contract
 * @access  Private (Students only)
 */
router.post(
  '/courses/:id/transfer',
  auth.authenticate,
  auth.hasRole(['student']),
  validateTransferCourse,
  handleValidationErrors,
  studentCourseController.transferCourseOwnership
);

module.exports = router;