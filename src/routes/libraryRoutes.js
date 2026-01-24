const express = require("express");
const router = express.Router();
const libraryController = require("../controllers/libraryController");
const auth = require("../middlewares/auth");

/**
 * @swagger
 * /api/library:
 *   get:
 *     summary: Get user's library dashboard
 *     description: Retrieve user's borrowed courses categorized as active, expired, and history
 *     tags: [Library]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Library retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     active:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           borrowId:
 *                             type: string
 *                           course:
 *                             type: object
 *                           borrowedAt:
 *                             type: string
 *                             format: date-time
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           remainingSeconds:
 *                             type: integer
 *                           progress:
 *                             type: number
 *                     expired:
 *                       type: array
 *                     history:
 *                       type: array
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/library", auth.authenticate, libraryController.getUserLibrary);

/**
 * @swagger
 * /api/library/return/{borrowId}:
 *   post:
 *     summary: Return a borrowed course
 *     description: Mark a borrowed course as returned
 *     tags: [Library]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: borrowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The borrow ID
 *     responses:
 *       200:
 *         description: Course returned successfully
 *       400:
 *         description: Borrow is not active
 *       404:
 *         description: Borrow not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/library/return/:borrowId",
  auth.authenticate,
  libraryController.returnBorrow,
);

/**
 * @swagger
 * /api/library/progress/{borrowId}:
 *   patch:
 *     summary: Update borrow progress
 *     description: Update the reading/completion progress of a borrowed course
 *     tags: [Library]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: borrowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The borrow ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - progress
 *             properties:
 *               progress:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Progress percentage (0-100)
 *     responses:
 *       200:
 *         description: Progress updated successfully
 *       400:
 *         description: Invalid progress value
 *       404:
 *         description: Borrow not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/library/progress/:borrowId",
  auth.authenticate,
  libraryController.updateProgress,
);

module.exports = router;
