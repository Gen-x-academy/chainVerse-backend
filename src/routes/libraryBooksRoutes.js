const express = require('express');
const { validationResult } = require('express-validator');
const libraryBooksController = require('../controllers/libraryBooksController');
const { validateLibraryBooksQuery } = require('../validators/libraryBooksValidator');

const router = express.Router();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

/**
 * Public browse/search/filter
 * GET /api/library/books
 */
router.get(
  '/books',
  validateLibraryBooksQuery,
  handleValidationErrors,
  libraryBooksController.listLibraryBooks,
);

module.exports = router;

