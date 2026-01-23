const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const {
  getAccountDetails,
  updateProfile,
  changePassword,
  uploadProfileImage,
  uploadProfileImageMiddleware
} = require('../controllers/studentAccountController');

const {
  validateProfileUpdate,
  validatePasswordChange,
  validateProfileImage
} = require('../validators/studentAccountValidator');

const { authenticate } = require('../middlewares/auth');

// Apply authentication middleware to all routes
router.use(authenticate);

// Rate limiting for password change attempts
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 password change attempts per window
  message: {
    success: false,
    message: 'Too many password change attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for profile updates
const profileUpdateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // Limit each IP to 10 profile updates per window
  message: {
    success: false,
    message: 'Too many profile update attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for profile image uploads
const imageUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Limit each IP to 5 image uploads per window
  message: {
    success: false,
    message: 'Too many image upload attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   GET /student/account
 * @desc    Get student account details
 * @access  Private (Student only)
 */
router.get('/account', getAccountDetails);

/**
 * @route   PUT /student/account/update
 * @desc    Update student profile
 * @access  Private (Student only)
 */
router.put('/account/update', 
  profileUpdateLimiter,
  validateProfileUpdate,
  updateProfile
);

/**
 * @route   PUT /student/account/change-password
 * @desc    Change student password
 * @access  Private (Student only)
 */
router.put('/account/change-password',
  passwordChangeLimiter,
  validatePasswordChange,
  changePassword
);

/**
 * @route   POST /student/account/upload-profile-image
 * @desc    Upload profile image
 * @access  Private (Student only)
 */
router.post('/account/upload-profile-image',
  imageUploadLimiter,
  uploadProfileImageMiddleware,
  validateProfileImage,
  uploadProfileImage
);

module.exports = router;
