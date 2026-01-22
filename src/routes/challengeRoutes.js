const express = require('express');
const router = express.Router();
const challengeController = require('../controllers/challengeController');
const authMiddleware = require('../middlewares/authMiddleware');
const challengeSecurity = require('../middlewares/challengeSecurityMiddleware');

// Apply authentication to all routes
router.use(authMiddleware);

// Submit answers route with comprehensive security
router.post(
	'/:challengeId/submit',
	challengeSecurity.auditChallengeAccess,
	challengeSecurity.challengeRateLimit,
	challengeSecurity.validateChallengeAccess,
	challengeSecurity.preventLateSubmission,
	challengeSecurity.validateSubmissionData,
	challengeController.submitAnswers
);

// Get challenge result
router.get(
	'/:challengeId/result',
	challengeSecurity.auditChallengeAccess,
	challengeSecurity.validateChallengeAccess,
	challengeController.getChallengeResult
);

// Get challenge history (no specific challenge validation needed)
router.get(
	'/history',
	challengeSecurity.challengeRateLimit,
	challengeController.getChallengeHistory
);

// Get leaderboard (public data)
router.get(
	'/leaderboard',
	challengeSecurity.challengeRateLimit,
	challengeController.getLeaderboard
);

// Manual evaluation (admin only)
router.post(
	'/:challengeId/evaluate',
	challengeSecurity.auditChallengeAccess,
	challengeSecurity.validateChallengeAccess,
	challengeController.evaluateChallenge
);

module.exports = router;
