const { body, query, param } = require('express-validator');

// Validation for generating a certificate
const validateGenerateCertificate = [
  body('studentId')
    .trim()
    .isMongoId()
    .withMessage('Valid student ID is required'),
  body('courseId')
    .trim()
    .isMongoId()
    .withMessage('Valid course ID is required')
];

// Validation for getting certificates by ID
const validateGetCertificateById = [
  param('certificateId')
    .trim()
    .notEmpty()
    .withMessage('Certificate ID is required')
];

// Validation for revoking a certificate
const validateRevokeCertificate = [
  param('certificateId')
    .trim()
    .notEmpty()
    .withMessage('Certificate ID is required'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Revocation reason must be less than 500 characters')
];

// Validation for filtering certificates
const validateFilterCertificates = [
  query('courseId')
    .optional()
    .trim()
    .isMongoId()
    .withMessage('Valid course ID is required when filtering'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('sortBy')
    .optional()
    .isIn(['issueDate', 'completionDate', 'courseTitle'])
    .withMessage('Sort by must be one of: issueDate, completionDate, courseTitle'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

module.exports = {
  validateGenerateCertificate,
  validateGetCertificateById,
  validateRevokeCertificate,
  validateFilterCertificates
};