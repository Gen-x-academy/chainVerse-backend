const express = require('express');
const router = express.Router();
const {
  submitReport,
  getMyReports,
  getAllReports,
  getReportById,
  reviewReport,
  bulkUpdateReports,
  getReportStats,
  deleteReport
} = require('../controllers/bookReportController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdminOrStaff, ensureAdmin } = require('../middlewares/roleMiddleware');
const { validateBookReport, validateReportReview, validateBulkUpdate } = require('../validators/bookReportValidator');
const { reportLimiter } = require('../utils/rateLimit');

// ============================================
// User Routes (authenticated users)
// ============================================

/**
 * @swagger
 * /api/book-reports:
 *   post:
 *     summary: Submit a new book report
 *     tags: [Book Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookId
 *               - reason
 *               - description
 *             properties:
 *               bookId:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [outdated, copyright, quality_issue, offensive, other]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Report submitted successfully
 *       409:
 *         description: Duplicate report
 */
router.post('/', authenticate, reportLimiter, validateBookReport, submitReport);

/**
 * @swagger
 * /api/book-reports/my-reports:
 *   get:
 *     summary: Get user's own reports
 *     tags: [Book Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 */
router.get('/my-reports', authenticate, getMyReports);

// ============================================
// Admin Routes (admin/staff only)
// ============================================

/**
 * @swagger
 * /api/book-reports/admin/stats:
 *   get:
 *     summary: Get report statistics
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
 */
router.get('/admin/stats', authenticate, isAdminOrStaff, getReportStats);

/**
 * @swagger
 * /api/book-reports/admin:
 *   get:
 *     summary: Get all reports with filters
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, under_review, resolved, dismissed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *       - in: query
 *         name: reason
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 */
router.get('/admin', authenticate, isAdminOrStaff, getAllReports);

/**
 * @swagger
 * /api/book-reports/admin/bulk-update:
 *   patch:
 *     summary: Bulk update report statuses
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportIds
 *               - status
 *             properties:
 *               reportIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *               adminNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reports updated successfully
 */
router.patch('/admin/bulk-update', authenticate, isAdminOrStaff, validateBulkUpdate, bulkUpdateReports);

/**
 * @swagger
 * /api/book-reports/admin/{reportId}:
 *   get:
 *     summary: Get single report details
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report retrieved successfully
 *       404:
 *         description: Report not found
 */
router.get('/admin/:reportId', authenticate, isAdminOrStaff, getReportById);

/**
 * @swagger
 * /api/book-reports/admin/{reportId}/review:
 *   patch:
 *     summary: Review/update report status
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, under_review, resolved, dismissed]
 *               adminNotes:
 *                 type: string
 *               resolution:
 *                 type: string
 *                 enum: [no_action, content_updated, book_removed, warning_issued]
 *               updateBookStatus:
 *                 type: string
 *                 enum: [remove, restore, review]
 *     responses:
 *       200:
 *         description: Report reviewed successfully
 */
router.patch('/admin/:reportId/review', authenticate, isAdminOrStaff, validateReportReview, reviewReport);

/**
 * @swagger
 * /api/book-reports/admin/{reportId}:
 *   delete:
 *     summary: Delete a report
 *     tags: [Book Reports - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report deleted successfully
 */
router.delete('/admin/:reportId', authenticate, ensureAdmin, deleteReport);

module.exports = router;
