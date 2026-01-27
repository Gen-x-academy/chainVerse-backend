const express = require('express');
const { getCourseLeaderboard, getTopicLeaderboard } = require('../controllers/leaderboardController');

const router = express.Router();

router.get('/course/:id', getCourseLeaderboard);
router.get('/topic/:id', getTopicLeaderboard);

module.exports = router;
