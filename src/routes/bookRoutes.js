const express = require('express');
const router = express.Router();
const bookController = require('../controllers/bookController');
const auth = require('../middlewares/auth');

// Public routes (or authenticated for all users)
router.get('/', bookController.getAllBooks);
router.get('/:id', bookController.getBookById);

// Protected routes (Admin/Tutor)
router.post(
    '/',
    auth.authenticate,
    auth.hasRole(['admin', 'tutor']),
    bookController.createBook
);

router.put(
    '/:id',
    auth.authenticate,
    auth.hasRole(['admin', 'tutor']),
    bookController.updateBook
);

router.delete(
    '/:id',
    auth.authenticate,
    auth.hasRole(['admin']),
    bookController.deleteBook
);

module.exports = router;
