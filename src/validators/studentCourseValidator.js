const { body, query, param } = require('express-validator');

// Validation for purchasing a course
const validatePurchaseCourse = [
  param('id')
    .trim()
    .isMongoId()
    .withMessage('Valid course ID is required'),
  body('transactionHash')
    .trim()
    .notEmpty()
    .withMessage('Transaction hash is required')
    .matches(/^0x[a-fA-F0-9]{64}$|^[a-fA-F0-9]{64}$/)
    .withMessage('Invalid transaction hash format'),
  body('cryptoCurrency')
    .trim()
    .notEmpty()
    .withMessage('Cryptocurrency type is required')
    .isIn(['ETH', 'BTC', 'MATIC', 'BNB', 'SOL'])
    .withMessage('Unsupported cryptocurrency. Supported types: ETH, BTC, MATIC, BNB, SOL'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
];

// Validation for transferring course ownership
const validateTransferCourse = [
  param('id')
    .trim()
    .isMongoId()
    .withMessage('Valid course ID is required'),
  body('recipientEmail')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid recipient email is required'),
  body('transactionHash')
    .optional()
    .trim()
    .matches(/^0x[a-fA-F0-9]{64}$|^[a-fA-F0-9]{64}$/)
    .withMessage('Invalid transaction hash format')
];

// Validation for searching courses
const validateSearchCourses = [
  query('searchTerm')
    .trim()
    .notEmpty()
    .withMessage('Search term is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Search term must be between 2 and 100 characters')
];

// Validation for getting student learning by ID
const validateGetStudentLearningById = [
  param('id')
    .trim()
    .isMongoId()
    .withMessage('Valid course ID is required')
];

// Validation for pagination parameters
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

module.exports = {
  validatePurchaseCourse,
  validateTransferCourse,
  validateSearchCourses,
  validateGetStudentLearningById,
  validatePagination
};