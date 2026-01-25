const { body, validationResult } = require('express-validator');

/**
 * Validation middleware for tutor-related requests
 */

// Validation for tutor creation
exports.validateTutorCreation = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Full name must be between 3 and 100 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password must contain at least one special character'),

  body('web3Expertise')
    .trim()
    .notEmpty().withMessage('Web3 expertise is required')
    .isLength({ min: 3, max: 500 }).withMessage('Web3 expertise description must be between 3 and 500 characters'),

  body('experience')
    .trim()
    .notEmpty().withMessage('Experience is required')
    .isLength({ min: 3, max: 1000 }).withMessage('Experience description must be between 3 and 1000 characters'),
];

// Validation for email verification
exports.validateEmailVerification = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('verificationCode')
    .trim()
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 characters long')
];

// Validation for tutor login
exports.validateTutorLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
];

// Validation for forgot password
exports.validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
];

// Validation for reset password
exports.validateResetPassword = [
  body('resetToken')
    .trim()
    .notEmpty().withMessage('Reset token is required'),

  body('password')
    .trim()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password must contain at least one special character'),

  body('confirmPassword')
    .trim()
    .notEmpty().withMessage('Confirm password is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

// Validation for refresh token
exports.validateRefreshToken = [
  body('refreshToken')
    .trim()
    .notEmpty().withMessage('Refresh token is required')
];

// Validation for profile update
exports.validateProfileUpdate = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('Full name must be between 3 and 100 characters'),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phoneNumber')
    .optional()
    .trim(),

  body('web3Expertise')
    .optional()
    .trim()
    .isLength({ min: 3, max: 500 }).withMessage('Web3 expertise description must be between 3 and 500 characters'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Bio cannot be more than 1000 characters'),

  body('profileImage')
    .optional()
    .trim()
    .isURL().withMessage('Profile image must be a valid URL'),
];

// Validation for change password
exports.validateChangePassword = [
  body('currentPassword')
    .trim()
    .notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .trim()
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/).withMessage('Password must contain at least one special character'),
];

// Middleware to check validation results
exports.validateResults = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(error => ({
        field: error.param || error.path,
        message: error.msg
      }))
    });
  }
  next();
};