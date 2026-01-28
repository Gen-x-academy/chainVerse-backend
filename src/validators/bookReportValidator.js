const { body, param, validationResult } = require('express-validator');

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

const validateBookReport = [
  body('bookId')
    .notEmpty()
    .withMessage('Book ID is required')
    .isMongoId()
    .withMessage('Invalid book ID format'),
  
  body('reason')
    .notEmpty()
    .withMessage('Report reason is required')
    .isIn(['outdated', 'copyright', 'quality_issue', 'offensive', 'other'])
    .withMessage('Invalid report reason'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters')
    .trim(),
  
  handleValidationErrors
];

const validateReportReview = [
  param('reportId')
    .isMongoId()
    .withMessage('Invalid report ID format'),
  
  body('status')
    .optional()
    .isIn(['pending', 'under_review', 'resolved', 'dismissed'])
    .withMessage('Invalid status'),
  
  body('adminNotes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Admin notes cannot exceed 2000 characters')
    .trim(),
  
  body('resolution')
    .optional()
    .isIn(['no_action', 'content_updated', 'book_removed', 'warning_issued'])
    .withMessage('Invalid resolution type'),
  
  body('updateBookStatus')
    .optional()
    .isIn(['remove', 'restore', 'review'])
    .withMessage('Invalid book status update option'),
  
  handleValidationErrors
];

const validateBulkUpdate = [
  body('reportIds')
    .isArray({ min: 1 })
    .withMessage('Report IDs must be a non-empty array'),
  
  body('reportIds.*')
    .isMongoId()
    .withMessage('Invalid report ID format in array'),
  
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['pending', 'under_review', 'resolved', 'dismissed'])
    .withMessage('Invalid status'),
  
  body('adminNotes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Admin notes cannot exceed 2000 characters')
    .trim(),
  
  handleValidationErrors
];

module.exports = {
  validateBookReport,
  validateReportReview,
  validateBulkUpdate
};
