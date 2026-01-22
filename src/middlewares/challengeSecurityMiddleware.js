const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const mongoose = require('mongoose');

/**
 * Enhanced security middleware for challenge operations
 */
exports.validateChallengeAccess = async (req, res, next) => {
	try {
		const { challengeId } = req.params;
		const playerId = req.user._id;

		// Validate challenge ID format
		if (!mongoose.Types.ObjectId.isValid(challengeId)) {
			return res.status(400).json({
				message: 'Invalid challenge ID format',
				code: 'INVALID_CHALLENGE_ID',
			});
		}

		const challenge = await Challenge.findById(challengeId);

		if (!challenge) {
			return res.status(404).json({
				message: 'Challenge not found',
				code: 'CHALLENGE_NOT_FOUND',
			});
		}

		// Check if user is a participant
		const isPlayerOne =
			challenge.playerOneId.toString() === playerId.toString();
		const isPlayerTwo =
			challenge.playerTwoId.toString() === playerId.toString();

		if (!isPlayerOne && !isPlayerTwo) {
			return res.status(403).json({
				message: 'Access denied. You are not a participant in this challenge.',
				code: 'ACCESS_DENIED',
			});
		}

		// Attach challenge and player info to request
		req.challenge = challenge;
		req.isPlayerOne = isPlayerOne;
		req.playerRole = isPlayerOne ? 'playerOne' : 'playerTwo';

		next();
	} catch (error) {
		console.error('Challenge access validation error:', error);
		res.status(500).json({
			message: 'Server error during access validation',
			code: 'VALIDATION_ERROR',
		});
	}
};

/**
 * Prevent submission after deadline or challenge completion
 */
exports.preventLateSubmission = async (req, res, next) => {
	try {
		const { challengeId } = req.params;
		const playerId = req.user._id;

		// Check challenge status
		if (req.challenge.status === 'completed') {
			return res.status(400).json({
				message:
					'Challenge has already been completed. No more submissions accepted.',
				code: 'CHALLENGE_COMPLETED',
			});
		}

		if (req.challenge.status === 'expired') {
			return res.status(400).json({
				message: 'Challenge has expired. No more submissions accepted.',
				code: 'CHALLENGE_EXPIRED',
			});
		}

		// Check time limits
		const now = new Date();
		if (req.challenge.expiresAt && now > req.challenge.expiresAt) {
			// Update challenge status to expired
			await Challenge.findByIdAndUpdate(challengeId, {
				status: 'expired',
				completedAt: now,
			});

			return res.status(400).json({
				message: 'Challenge time limit has been exceeded.',
				code: 'TIME_LIMIT_EXCEEDED',
			});
		}

		// Check for existing submission
		const existingSubmission = await ChallengeSubmission.findOne({
			challengeId,
			playerId,
		});

		if (existingSubmission) {
			return res.status(400).json({
				message: 'You have already submitted answers for this challenge.',
				code: 'ALREADY_SUBMITTED',
			});
		}

		next();
	} catch (error) {
		console.error('Late submission check error:', error);
		res.status(500).json({
			message: 'Server error during submission validation',
			code: 'SUBMISSION_VALIDATION_ERROR',
		});
	}
};

/**
 * Rate limiting for challenge operations
 */
exports.challengeRateLimit = (req, res, next) => {
	// Simple rate limiting - in production, use Redis or similar
	const playerId = req.user._id.toString();
	const now = Date.now();

	if (!req.app.locals.challengeRequestCounts) {
		req.app.locals.challengeRequestCounts = {};
	}

	const userRequests = req.app.locals.challengeRequestCounts[playerId] || [];

	// Remove requests older than 1 minute
	const recentRequests = userRequests.filter(
		(timestamp) => now - timestamp < 60000
	);

	if (recentRequests.length >= 10) {
		// Max 10 requests per minute
		return res.status(429).json({
			message: 'Too many requests. Please wait before trying again.',
			code: 'RATE_LIMIT_EXCEEDED',
			retryAfter: 60,
		});
	}

	// Add current request
	recentRequests.push(now);
	req.app.locals.challengeRequestCounts[playerId] = recentRequests;

	next();
};

/**
 * Validate submission data format and content
 */
exports.validateSubmissionData = (req, res, next) => {
	try {
		const { answers, totalTime } = req.body;

		// Validate answers format
		if (!Array.isArray(answers)) {
			return res.status(400).json({
				message: 'Answers must be provided as an array',
				code: 'INVALID_ANSWERS_FORMAT',
			});
		}

		if (answers.length === 0) {
			return res.status(400).json({
				message: 'At least one answer must be provided',
				code: 'NO_ANSWERS_PROVIDED',
			});
		}

		// Validate total time
		if (typeof totalTime !== 'number' || totalTime < 0) {
			return res.status(400).json({
				message: 'Total time must be a positive number',
				code: 'INVALID_TIME_FORMAT',
			});
		}

		// Validate individual answers
		for (let i = 0; i < answers.length; i++) {
			const answer = answers[i];
			if (!answer.questionId || !answer.selectedOption) {
				return res.status(400).json({
					message: `Answer ${i + 1} must include questionId and selectedOption`,
					code: 'INCOMPLETE_ANSWER',
				});
			}

			// Validate questionId format
			if (typeof answer.questionId !== 'string') {
				return res.status(400).json({
					message: `Answer ${i + 1} questionId must be a string`,
					code: 'INVALID_QUESTION_ID_FORMAT',
				});
			}

			// Validate selectedOption format
			if (typeof answer.selectedOption !== 'string') {
				return res.status(400).json({
					message: `Answer ${i + 1} selectedOption must be a string`,
					code: 'INVALID_SELECTED_OPTION_FORMAT',
				});
			}
		}

		// Check for duplicate question answers
		const questionIds = answers.map((a) => a.questionId);
		const uniqueQuestionIds = [...new Set(questionIds)];

		if (questionIds.length !== uniqueQuestionIds.length) {
			return res.status(400).json({
				message: 'Duplicate answers for the same question are not allowed',
				code: 'DUPLICATE_QUESTION_ANSWERS',
			});
		}

		// Validate against challenge questions
		if (req.challenge && req.challenge.questions) {
			if (answers.length !== req.challenge.questions.length) {
				return res.status(400).json({
					message: `Expected ${req.challenge.questions.length} answers, received ${answers.length}`,
					code: 'ANSWER_COUNT_MISMATCH',
				});
			}

			// Validate each answer corresponds to a challenge question
			const challengeQuestionIds = req.challenge.questions.map(
				(q) => q.questionId
			);
			for (const answer of answers) {
				if (!challengeQuestionIds.includes(answer.questionId)) {
					return res.status(400).json({
						message: `Question ${answer.questionId} not found in challenge`,
						code: 'INVALID_QUESTION_ID',
					});
				}
			}
		}

		next();
	} catch (error) {
		console.error('Submission validation error:', error);
		res.status(500).json({
			message: 'Server error during submission validation',
			code: 'VALIDATION_ERROR',
		});
	}
};

/**
 * Log challenge access for audit purposes
 */
exports.auditChallengeAccess = (req, res, next) => {
	const auditData = {
		timestamp: new Date().toISOString(),
		userId: req.user._id,
		challengeId: req.params.challengeId,
		action: req.method + ' ' + req.path,
		ipAddress: req.ip,
		userAgent: req.get('User-Agent'),
	};

	// In production, this would be logged to a proper audit system
	console.log('CHALLENGE_AUDIT:', auditData);

	next();
};
