const { query } = require('express-validator');
const mongoose = require('mongoose');

const ALLOWED_SORTS = new Set(['recent', 'popular', 'relevance']);

const validateLibraryBooksQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer >= 1')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
  query('sort')
    .optional()
    .custom((value) => ALLOWED_SORTS.has(String(value)))
    .withMessage('sort must be one of: recent, popular, relevance'),
  query('courseId')
    .optional()
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('courseId must be a valid ObjectId'),
  query('search').optional().isString().trim(),
  query('title').optional().isString().trim(),
  query('author').optional().isString().trim(),
  query('category').optional().isString().trim(),
  query('tags').optional().isString().trim(),
  query('topic').optional().isString().trim(),
];

module.exports = {
  validateLibraryBooksQuery,
};

