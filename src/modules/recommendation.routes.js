const router = require('express').Router();
const { authMiddleware } = require('../../middlewares/authMiddleware');
const { getNextCourses } = require('./recommendation.controller');

router.get('/next-courses', authMiddleware, getNextCourses);

module.exports = router;
