const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/bookReviewController");
const { authenticate } = require("../middlewares/authMiddleware");

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       required:
 *         - book
 *         - user
 *         - rating
 *       properties:
 *         _id:
 *           type: string
 *         book:
 *           type: string
 *           description: Book ID
 *         user:
 *           type: string
 *           description: User ID
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           description: Rating from 1 to 5 stars
 *         review:
 *           type: string
 *           maxLength: 2000
 *           description: Optional review text
 *         helpful:
 *           type: number
 *           default: 0
 *           description: Number of helpful votes
 *         reported:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     RatingDistribution:
 *       type: object
 *       properties:
 *         1:
 *           type: number
 *         2:
 *           type: number
 *         3:
 *           type: number
 *         4:
 *           type: number
 *         5:
 *           type: number
 */

/**
 * @swagger
 * /api/books/{bookId}/reviews:
 *   post:
 *     summary: Create or update a book review
 *     description: Allows a user to create a new review or update their existing review for a book. Limited to one review per user per book.
 *     tags: [Reviews]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: string
 *         description: The book ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Rating from 1 to 5 stars
 *                 example: 5
 *               review:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Optional review text (max 2000 characters)
 *                 example: "This book was incredibly helpful for understanding the concepts. Highly recommended!"
 *     responses:
 *       201:
 *         description: Review created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       200:
 *         description: Review updated successfully
 *       400:
 *         description: Invalid input (rating out of range or review too long)
 *       404:
 *         description: Book not found
 *       429:
 *         description: Too many reviews submitted (rate limit exceeded)
 */
router.post(
  "/books/:bookId/reviews",
  authenticate,
  reviewController.createOrUpdateReview,
);

/**
 * @swagger
 * /api/books/{bookId}/reviews:
 *   get:
 *     summary: Get all reviews for a book
 *     description: Retrieve paginated reviews for a specific book with sorting options
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: string
 *         description: The book ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of reviews per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [recent, helpful, highest, lowest]
 *           default: recent
 *         description: Sort order (recent, helpful, highest rating, lowest rating)
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Reviews retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     reviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Review'
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalReviews:
 *                       type: integer
 *                       example: 47
 *                     bookRating:
 *                       type: object
 *                       properties:
 *                         average:
 *                           type: number
 *                           example: 4.3
 *                         total:
 *                           type: integer
 *                           example: 47
 *                         distribution:
 *                           $ref: '#/components/schemas/RatingDistribution'
 *       404:
 *         description: Book not found
 */
router.get("/books/:bookId/reviews", reviewController.getBookReviews);

/**
 * @swagger
 * /api/reviews/my-review/{bookId}:
 *   get:
 *     summary: Get current user's review for a book
 *     description: Retrieve the authenticated user's review for a specific book
 *     tags: [Reviews]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema:
 *           type: string
 *         description: The book ID
 *     responses:
 *       200:
 *         description: Review retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       404:
 *         description: Review not found
 */
router.get(
  "/reviews/my-review/:bookId",
  authenticate,
  reviewController.getMyReview,
);

/**
 * @swagger
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: Delete a review
 *     description: Delete the user's own review (users can only delete their own reviews unless they are admin)
 *     tags: [Reviews]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: The review ID
 *     responses:
 *       200:
 *         description: Review deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review deleted successfully
 *       403:
 *         description: Not authorized to delete this review
 *       404:
 *         description: Review not found
 */
router.delete(
  "/reviews/:reviewId",
  authenticate,
  reviewController.deleteReview,
);

/**
 * @swagger
 * /api/reviews/{reviewId}/helpful:
 *   post:
 *     summary: Mark a review as helpful
 *     description: Increment the helpful counter for a review
 *     tags: [Reviews]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: The review ID
 *     responses:
 *       200:
 *         description: Review marked as helpful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review marked as helpful
 *                 data:
 *                   $ref: '#/components/schemas/Review'
 *       404:
 *         description: Review not found
 */
router.post(
  "/reviews/:reviewId/helpful",
  authenticate,
  reviewController.markReviewHelpful,
);

/**
 * @swagger
 * /api/reviews/{reviewId}/report:
 *   post:
 *     summary: Report an abusive review
 *     description: Flag a review as reported (will be excluded from aggregate ratings and hidden from public view)
 *     tags: [Reviews]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: The review ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for reporting the review
 *                 example: Inappropriate content
 *     responses:
 *       200:
 *         description: Review reported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review reported successfully
 *       404:
 *         description: Review not found
 */
router.post(
  "/reviews/:reviewId/report",
  authenticate,
  reviewController.reportReview,
);

module.exports = router;
