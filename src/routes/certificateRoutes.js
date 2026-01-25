const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const auth = require('../middlewares/auth');
const { 
  validateGenerateCertificate,
  validateGetCertificateById,
  validateRevokeCertificate,
  validateFilterCertificates
} = require('../validators/certificateValidator');
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

// Certificate Generation (admin/system)
/**
 * @route   POST /certificates/generate
 * @desc    Generate a certificate for a student and course
 * @access  Private (Admin only)
 */
router.post(
  '/certificates/generate',
  auth.authenticate,
  auth.hasRole(['admin']),
  validateGenerateCertificate,
  handleValidationErrors,
  certificateController.generateCertificate
);

// Student Certificate Retrieval
/**
 * @route   GET /certificates/my-certificates
 * @desc    Get all certificates for the authenticated student
 * @access  Private (Students only)
 */
router.get(
  '/certificates/my-certificates',
  auth.authenticate,
  auth.hasRole(['student']),
  validateFilterCertificates,
  handleValidationErrors,
  certificateController.getMyCertificates
);

/**
 * @route   GET /certificates/:certificateId
 * @desc    Get a specific certificate by ID
 * @access  Private (Students only)
 */
router.get(
  '/certificates/:certificateId',
  auth.authenticate,
  auth.hasRole(['student']),
  validateGetCertificateById,
  handleValidationErrors,
  certificateController.getCertificateById
);

// Public verification endpoint
/**
 * @route   GET /certificates/verify/:publicHash
 * @desc    Verify a certificate by public hash
 * @access  Public
 */
router.get(
  '/certificates/verify/:publicHash',
  certificateController.verifyCertificate
);

// Admin endpoints
/**
 * @route   PUT /certificates/:certificateId/revoke
 * @desc    Revoke a certificate
 * @access  Private (Admin only)
 */
router.put(
  '/certificates/:certificateId/revoke',
  auth.authenticate,
  auth.hasRole(['admin']),
  validateRevokeCertificate,
  handleValidationErrors,
  certificateController.revokeCertificate
);

/**
 * @route   GET /certificates/download/:certificateId
 * @desc    Download certificate as PDF
 * @access  Private (Students only)
 */
router.get(
  '/certificates/download/:certificateId',
  auth.authenticate,
  auth.hasRole(['student']),
  validateGetCertificateById,
  handleValidationErrors,
  certificateController.downloadCertificate
);

module.exports = router;