const express = require('express');
const certificateNameChangeController = require('../controllers/certificateNameChangeController');
const { authenticate } = require('../middlewares/auth');
const rateLimitMiddleware = require('../middlewares/rateLimitMiddleware');
const { nameChangeRequestSchema, statusFilterSchema } = require('../validators/certificateNameChangeValidator');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/certificate-name-change-documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept only PDF, JPG, JPEG, PNG
  const allowedTypes = /pdf|jpg|jpeg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

// Middleware to verify student account
const verifyStudentAccount = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is verified
    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Only verified student accounts can access this endpoint'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying student account'
    });
  }
};

// Rate limiting configuration (10 requests per hour)
const nameChangeRateLimit = rateLimitMiddleware({
  exemptRoutes: []
});

/**
 * @route   POST /certificates/name-change/request
 * @desc    Submit a name change request
 * @access  Private (Verified Students Only)
 */
router.post(
  '/request',
  authenticate,
  verifyStudentAccount,
  nameChangeRateLimit,
  upload.single('supportingDocument'),
  validateRequest(nameChangeRequestSchema),
  certificateNameChangeController.submitNameChangeRequest
);

/**
 * @route   GET /certificates/name-change/my-requests
 * @desc    Get all name change requests for the authenticated student
 * @access  Private (Verified Students Only)
 */
router.get(
  '/my-requests',
  authenticate,
  verifyStudentAccount,
  validateQuery(statusFilterSchema),
  certificateNameChangeController.getMyNameChangeRequests
);

/**
 * @route   GET /certificates/name-change/request/:requestId
 * @desc    Get a specific name change request by ID
 * @access  Private (Verified Students Only)
 */
router.get(
  '/request/:requestId',
  authenticate,
  verifyStudentAccount,
  certificateNameChangeController.getNameChangeRequestById
);

module.exports = router;
