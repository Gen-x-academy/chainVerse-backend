const router = require("express").Router();
const auth = require("../middlewares/auth");
const { getNextCourses } = require("./recommendation.controller");

/**
 * @swagger
 * /api/recommendation/next-courses:
 *   get:
 *     summary: Get recommended next courses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Recommended courses
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get("/next-courses", auth.authenticate, getNextCourses);

module.exports = router;
