const ChallengeEvaluationService = require('../services/ChallengeEvaluationService');
const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const ChallengeResult = require('../models/ChallengeResult');
const mongoose = require('mongoose');

exports.submitAnswers = async (req, res) => {
	try {
		const { challengeId } = req.params;
		const { answers, totalTime } = req.body;
		const playerId = req.user._id;

		// Enhanced validation
		if (!challengeId || !mongoose.Types.ObjectId.isValid(challengeId)) {
			return res.status(400).json({
				message: 'Invalid challenge ID format',
				code: 'INVALID_CHALLENGE_ID',
			});
		}

		if (!Array.isArray(answers) || answers.length === 0) {
			return res.status(400).json({
				message: 'Answers must be a non-empty array',
				code: 'INVALID_ANSWERS_FORMAT',
			});
		}

		if (typeof totalTime !== 'number' || totalTime < 0) {
			return res.status(400).json({
				message: 'Total time must be a positive number',
				code: 'INVALID_TIME_FORMAT',
			});
		}

		const challenge = await Challenge.findById(challengeId);
		if (!challenge) {
			return res.status(404).json({
				message: 'Challenge not found',
				code: 'CHALLENGE_NOT_FOUND',
			});
		}

		// Enhanced access control
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

		// Check challenge state
		if (challenge.status === 'completed') {
			return res.status(400).json({
				message: 'Challenge has already been completed',
				code: 'CHALLENGE_COMPLETED',
			});
		}

		if (challenge.status === 'expired') {
			return res.status(400).json({
				message: 'Challenge has expired',
				code: 'CHALLENGE_EXPIRED',
			});
		}

		// Check for existing submission
		const existingSubmission = await ChallengeSubmission.findOne({
			challengeId,
			playerId,
		});

		if (existingSubmission) {
			return res.status(400).json({
				message: 'You have already submitted answers for this challenge',
				code: 'ALREADY_SUBMITTED',
			});
		}

		// Validate answers against challenge questions
		const validationResult =
			await ChallengeEvaluationService.validateSubmissionData({
				answers,
				totalTime,
				playerId,
			});

		if (!validationResult) {
			return res.status(400).json({
				message: 'Submission validation failed',
				code: 'VALIDATION_FAILED',
			});
		}

		// Validate answers match challenge questions
		if (answers.length !== challenge.questions.length) {
			return res.status(400).json({
				message: `Expected ${challenge.questions.length} answers, received ${answers.length}`,
				code: 'ANSWER_COUNT_MISMATCH',
			});
		}

		// Check time limit compliance
		const maxTime = challenge.timeLimit || 300000; // 5 minutes default
		if (totalTime > maxTime) {
			return res.status(400).json({
				message: 'Submission exceeds time limit',
				code: 'TIME_LIMIT_EXCEEDED',
			});
		}

		// Create submission with additional security metadata
		const submission = new ChallengeSubmission({
			challengeId,
			playerId,
			answers,
			totalTime,
			submissionMetadata: {
				ipAddress: req.ip,
				userAgent: req.get('User-Agent'),
				timestamp: new Date(),
			},
		});

		await submission.save();

		// Update challenge status if this is the first submission
		if (challenge.status === 'pending') {
			await Challenge.findByIdAndUpdate(challengeId, {
				status: 'in_progress',
				startedAt: new Date(),
			});
		}

		const totalSubmissions = await ChallengeSubmission.countDocuments({
			challengeId,
		});

		if (totalSubmissions === 2) {
			// Both players have submitted - trigger evaluation
			setTimeout(async () => {
				try {
					await ChallengeEvaluationService.evaluateChallenge(challengeId);
				} catch (error) {
					console.error('Async evaluation failed:', error);
				}
			}, 100);

			res.status(200).json({
				message: 'Answers submitted successfully. Evaluation in progress...',
				bothPlayersSubmitted: true,
				submissionId: submission._id,
				evaluationEstimatedTime: '30-60 seconds',
			});
		} else {
			res.status(200).json({
				message: 'Answers submitted successfully. Waiting for opponent...',
				bothPlayersSubmitted: false,
				submissionId: submission._id,
				waitingFor: isPlayerOne ? 'Player Two' : 'Player One',
			});
		}
	} catch (error) {
		console.error('Error submitting answers:', error);
		res.status(500).json({
			message: 'Internal server error while submitting answers',
			code: 'SUBMISSION_ERROR',
		});
	}
};

exports.getChallengeResult = async (req, res) => {
	try {
		const { challengeId } = req.params;
		const playerId = req.user._id;

		// Verify player is part of the challenge
		const challenge = await Challenge.findById(challengeId);
		if (!challenge) {
			return res.status(404).json({ message: 'Challenge not found' });
		}

		if (
			challenge.playerOneId.toString() !== playerId.toString() &&
			challenge.playerTwoId.toString() !== playerId.toString()
		) {
			return res
				.status(403)
				.json({ message: 'Not authorized for this challenge' });
		}

		const result = await ChallengeResult.findOne({ challengeId }).populate({
			path: 'challengeId',
			populate: [
				{ path: 'playerOneId', select: 'name email' },
				{ path: 'playerTwoId', select: 'name email' },
			],
		});

		if (!result) {
			return res.status(404).json({ message: 'Challenge not yet completed' });
		}

		// Determine if current user won
		const isWinner =
			result.winnerId && result.winnerId.toString() === playerId.toString();
		const isDraw = !result.winnerId;

		res.status(200).json({
			challengeId,
			playerOne: {
				id: result.playerOneId,
				name: result.challengeId.playerOneId.name,
				score: result.playerOneScore,
				time: result.playerOneTime,
			},
			playerTwo: {
				id: result.playerTwoId,
				name: result.challengeId.playerTwoId.name,
				score: result.playerTwoScore,
				time: result.playerTwoTime,
			},
			winnerId: result.winnerId,
			isWinner,
			isDraw,
			completedAt: result.completedAt,
		});
	} catch (error) {
		console.error('Error getting challenge result:', error);
		res.status(500).json({ message: 'Error fetching challenge result' });
	}
};

exports.getChallengeHistory = async (req, res) => {
	try {
		const playerId = req.user._id;
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 10;
		const skip = (page - 1) * limit;

		const challenges = await Challenge.find({
			$or: [{ playerOneId: playerId }, { playerTwoId: playerId }],
			status: 'completed',
		})
			.populate('playerOneId playerTwoId', 'name')
			.sort({ completedAt: -1 })
			.skip(skip)
			.limit(limit);

		const challengeIds = challenges.map((c) => c._id);
		const results = await ChallengeResult.find({
			challengeId: { $in: challengeIds },
		});

		// Combine challenge and result data
		const history = challenges.map((challenge) => {
			const result = results.find(
				(r) => r.challengeId.toString() === challenge._id.toString()
			);

			const isPlayerOne =
				challenge.playerOneId._id.toString() === playerId.toString();
			const opponent = isPlayerOne
				? challenge.playerTwoId
				: challenge.playerOneId;
			const playerScore = isPlayerOne
				? result?.playerOneScore
				: result?.playerTwoScore;
			const opponentScore = isPlayerOne
				? result?.playerTwoScore
				: result?.playerOneScore;

			let outcome = 'draw';
			if (result?.winnerId) {
				outcome =
					result.winnerId.toString() === playerId.toString() ? 'won' : 'lost';
			}

			return {
				challengeId: challenge._id,
				opponent: opponent.name,
				playerScore,
				opponentScore,
				outcome,
				completedAt: challenge.completedAt,
			};
		});

		const totalChallenges = await Challenge.countDocuments({
			$or: [{ playerOneId: playerId }, { playerTwoId: playerId }],
			status: 'completed',
		});

		res.status(200).json({
			history,
			pagination: {
				page,
				limit,
				totalPages: Math.ceil(totalChallenges / limit),
				totalChallenges,
			},
		});
	} catch (error) {
		console.error('Error getting challenge history:', error);
		res.status(500).json({ message: 'Error fetching challenge history' });
	}
};

exports.getLeaderboard = async (req, res) => {
	try {
		const { courseId, type = 'global' } = req.query;
		const limit = parseInt(req.query.limit) || 10;

		let leaderboard;
		if (type === 'course' && courseId) {
			leaderboard = await ChallengeEvaluationService.getCourseLeaderboard(
				courseId,
				limit
			);
		} else {
			leaderboard = await ChallengeEvaluationService.getGlobalLeaderboard(
				limit
			);
		}

		res.status(200).json({ leaderboard, type, courseId });
	} catch (error) {
		console.error('Error getting leaderboard:', error);
		res.status(500).json({ message: 'Error fetching leaderboard' });
	}
};

exports.evaluateChallenge = async (req, res) => {
	try {
		const { challengeId } = req.params;

		if (!req.user.isAdmin) {
			return res.status(403).json({ message: 'Admin access required' });
		}

		const result = await ChallengeEvaluationService.evaluateChallenge(
			challengeId
		);

		res.status(200).json({
			message: 'Challenge evaluation completed',
			result,
		});
	} catch (error) {
		console.error('Error in manual evaluation:', error);
		res.status(500).json({ message: error.message });
	}
};
