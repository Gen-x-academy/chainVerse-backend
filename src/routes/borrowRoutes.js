const express = require("express");
const router = express.Router();
const borrowController = require("../controllers/borrowController");
const { authMiddleware } = require("../middlewares/authMiddleware"); 

console.log("Borrow controller loaded from:", borrowController);

// routes/borrowRoutes.js
console.log("Borrow controller path:", require.resolve("../controllers/borrowController"));



// ===== BOOK-SPECIFIC ROUTES (NEW) =====
/**
 * @swagger
 * /api/library/books/{bookId}/borrow:
 *   post:
 *     summary: Borrow a specific book
 *     tags: [Library]
 */
router.post("/library/books/:bookId/borrow", authMiddleware, borrowController.borrowBook);

/**
 * @swagger
 * /api/library/books/{bookId}/return:
 *   post:
 *     summary: Return a specific book
 *     tags: [Library]
 */
router.post("/library/books/:bookId/return", authMiddleware, borrowController.returnBook);

/* @swagger
 * /api/library/books/{bookId}/access:
 *   get:
 *     summary: Access/read a borrowed book (protected)
 *     tags: [Library]
 */
router.get("/library/books/:bookId/access", authMiddleware, borrowController.accessBook);
//router.post("/library/books/:bookId/borrow", authMiddleware, borrowController.borrowBook);
/**
 * @swagger
 * /api/borrows:
 *   post:
 *     summary: Borrow a resource
 *     tags: [Borrows]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resourceId
 *               - resourceType
 *               - resourceTitle
 *             properties:
 *               resourceId:
 *                 type: string
 *               resourceType:
 *                 type: string
 *                 enum: [course, book, material, equipment]
 *               resourceTitle:
 *                 type: string
 *               borrowDurationDays:
 *                 type: number
 *                 default: 14
 */

console.log("Borrow controller is",borrowController)
router.post("/", authMiddleware, borrowController.createBorrow);

/**
 * @swagger
 * /api/borrows:
 *   get:
 *     summary: Get user's borrows
 *     tags: [Borrows]
 *     security:
 *       - BearerAuth: []
 */
router.get("/", authMiddleware, borrowController.getUserBorrows);

/**
 * @swagger
 * /api/borrows/stats:
 *   get:
 *     summary: Get borrow statistics
 *     tags: [Borrows]
 *     security:
 *       - BearerAuth: []
 */
router.get("/stats", authMiddleware, borrowController.getBorrowStats);

/**
 * @swagger
 * /api/borrows/{id}/return:
 *   patch:
 *     summary: Return a borrowed resource
 *     tags: [Borrows]
 *     security:
 *       - BearerAuth: []
 */
router.patch("/:id/return", authMiddleware, borrowController.returnBorrow);

/**
 * @swagger
 * /api/borrows/{id}/renew:
 *   patch:
 *     summary: Renew a borrow
 *     tags: [Borrows]
 *     security:
 *       - BearerAuth: []
 */
router.patch("/:id/renew", authMiddleware, borrowController.renewBorrow);

module.exports = router;
