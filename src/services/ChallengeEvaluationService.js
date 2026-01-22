const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const ChallengeResult = require('../models/ChallengeResult');
const StudentPoints = require('../models/studentPoints');
const Question = require('../models/Question');
const { sendEmail } = require('../services/emailService');
const { mintNFT } = require('../utils/nftService');
const tokenService = require('../services/tokenService');

class ChallengeEvaluationService {
	async evaluateChallenge(challengeId) {
		try {
			console.log(`Starting evaluation for challenge: ${challengeId}`);

			const challenge = await Challenge.findById(challengeId)
				.populate('playerOneId playerTwoId')
				.populate('questions.questionId');

			if (!challenge) {
				throw new Error('Challenge not found');
			}

			if (challenge.status === 'completed') {
				throw new Error('Challenge has already been evaluated');
			}

			const submissions = await ChallengeSubmission.find({ challengeId });

			if (submissions.length !== 2) {
				throw new Error('Both players must submit before evaluation');
			}

			const playerOneSubmission = submissions.find(
				(s) => s.playerId.toString() === challenge.playerOneId._id.toString()
			);
			const playerTwoSubmission = submissions.find(
				(s) => s.playerId.toString() === challenge.playerTwoId._id.toString()
			);

			if (!playerOneSubmission || !playerTwoSubmission) {
				throw new Error('Invalid submission data found');
			}

			// Calculate detailed scores
			const playerOneScoreData = await this.calculateScore(
				playerOneSubmission,
				challenge.questions
			);
			const playerTwoScoreData = await this.calculateScore(
				playerTwoSubmission,
				challenge.questions
			);

			// Determine winner with enhanced logic
			const result = this.determineWinner(
				challenge.playerOneId._id,
				challenge.playerTwoId._id,
				playerOneScoreData,
				playerTwoScoreData,
				playerOneSubmission.totalTime,
				playerTwoSubmission.totalTime
			);

			// Save comprehensive results
			const challengeResult = await this.saveResults(challengeId, {
				playerOneId: challenge.playerOneId._id,
				playerTwoId: challenge.playerTwoId._id,
				playerOneScore: playerOneScoreData.score,
				playerTwoScore: playerTwoScoreData.score,
				playerOneTime: playerOneSubmission.totalTime,
				playerTwoTime: playerTwoSubmission.totalTime,
				winnerId: result.winnerId,
				isDraw: result.isDraw,
				winnerReason: result.winnerReason,
				playerOnePercentage: playerOneScoreData.percentage,
				playerTwoPercentage: playerTwoScoreData.percentage,
				detailedResults: {
					playerOne: playerOneScoreData.detailedResults,
					playerTwo: playerTwoScoreData.detailedResults,
				},
			});

			// Update challenge status
			await Challenge.findByIdAndUpdate(challengeId, {
				status: 'completed',
				completedAt: new Date(),
			});

			// Execute post-evaluation tasks
			await Promise.all([
				this.updateLeaderboards(
					challenge,
					result,
					playerOneScoreData,
					playerTwoScoreData
				),
				this.distributeRewards(challenge, challengeResult),
				this.sendNotifications(
					challenge,
					result,
					playerOneScoreData,
					playerTwoScoreData
				),
			]);

			console.log(`Challenge ${challengeId} evaluation completed successfully`);
			return challengeResult;
		} catch (error) {
			console.error(`Error evaluating challenge ${challengeId}:`, error);
			await this.handleEvaluationError(challengeId, error);
			throw error;
		}
	}

	async calculateScore(submission, challengeQuestions) {
		let correctAnswers = 0;
		const detailedResults = [];

		for (const answer of submission.answers) {
			const challengeQuestion = challengeQuestions.find(
				(q) =>
					q.questionId._id?.toString() === answer.questionId ||
					q.questionId.toString() === answer.questionId
			);

			const isCorrect =
				challengeQuestion &&
				(answer.selectedOption === challengeQuestion.correctOption ||
					answer.selectedOption === challengeQuestion.correctOptionId);

			if (isCorrect) {
				correctAnswers++;
			}

			// Store detailed result for audit purposes
			detailedResults.push({
				questionId: answer.questionId,
				selectedOption: answer.selectedOption,
				correctOption:
					challengeQuestion?.correctOption ||
					challengeQuestion?.correctOptionId,
				isCorrect,
				questionText: challengeQuestion?.text || 'Question not found',
			});
		}

		return {
			score: correctAnswers,
			totalQuestions: challengeQuestions.length,
			percentage: Math.round(
				(correctAnswers / challengeQuestions.length) * 100
			),
			detailedResults,
		};
	}

	determineWinner(
		playerOneId,
		playerTwoId,
		scoreOneData,
		scoreTwoData,
		timeOne,
		timeTwo
	) {
		let winnerId = null;
		let isDraw = false;
		let winnerReason = '';

		const scoreOne = scoreOneData.score || scoreOneData;
		const scoreTwo = scoreTwoData.score || scoreTwoData;

		if (scoreOne > scoreTwo) {
			winnerId = playerOneId;
			winnerReason = 'Higher score';
		} else if (scoreTwo > scoreOne) {
			winnerId = playerTwoId;
			winnerReason = 'Higher score';
		} else {
			// Scores are tied, use time as tiebreaker
			if (timeOne < timeTwo) {
				winnerId = playerOneId;
				winnerReason = 'Faster completion time (tiebreaker)';
			} else if (timeTwo < timeOne) {
				winnerId = playerTwoId;
				winnerReason = 'Faster completion time (tiebreaker)';
			} else {
				// Perfect tie - same score and time
				isDraw = true;
				winnerReason = 'Perfect tie - same score and completion time';
			}
		}

		return {
			winnerId,
			isDraw,
			winnerReason,
			scoreComparison: {
				playerOneScore: scoreOne,
				playerTwoScore: scoreTwo,
				playerOneTime: timeOne,
				playerTwoTime: timeTwo,
			},
		};
	}

	async saveResults(challengeId, resultData) {
		try {
			const challengeResult = new ChallengeResult({
				challengeId,
				...resultData,
				evaluatedAt: new Date(),
				auditTrail: {
					evaluationTimestamp: new Date(),
					evaluationMethod: 'automatic',
					dataIntegrityHash: this.generateDataHash(resultData),
				},
			});

			await challengeResult.save();

			// Mark rewards and notifications as pending
			await ChallengeResult.findByIdAndUpdate(challengeResult._id, {
				rewardsDistributed: false,
				notificationsSent: false,
			});

			return challengeResult;
		} catch (error) {
			console.error('Error saving challenge results:', error);
			throw new Error('Failed to persist challenge results');
		}
	}

	generateDataHash(data) {
		// Simple hash generation for audit purposes
		const crypto = require('crypto');
		const jsonString = JSON.stringify(data, Object.keys(data).sort());
		return crypto.createHash('sha256').update(jsonString).digest('hex');
	}

	async updateLeaderboards(
		challenge,
		result,
		playerOneScoreData,
		playerTwoScoreData
	) {
		// Use database transaction to ensure data consistency
		const session = await StudentPoints.startSession();

		try {
			await session.withTransaction(async () => {
				const winnerPoints = 50;
				const loserPoints = 10;
				const drawPoints = 25;
				const bonusPoints = this.calculateBonusPoints(
					playerOneScoreData,
					playerTwoScoreData
				);

				let playerOnePoints, playerTwoPoints;
				const playerOneScore = playerOneScoreData.score || playerOneScoreData;
				const playerTwoScore = playerTwoScoreData.score || playerTwoScoreData;

				if (result.isDraw) {
					playerOnePoints = drawPoints + bonusPoints.playerOne;
					playerTwoPoints = drawPoints + bonusPoints.playerTwo;
				} else if (
					result.winnerId.toString() === challenge.playerOneId._id.toString()
				) {
					playerOnePoints = winnerPoints + bonusPoints.playerOne;
					playerTwoPoints = loserPoints + bonusPoints.playerTwo;
				} else {
					playerOnePoints = loserPoints + bonusPoints.playerOne;
					playerTwoPoints = winnerPoints + bonusPoints.playerTwo;
				}

				await this.updatePlayerPointsWithSession(
					challenge.playerOneId._id,
					playerOnePoints,
					'challenge_completion',
					`Challenge match - Score: ${playerOneScore}/${
						playerOneScoreData.totalQuestions || challenge.questions.length
					}`,
					challenge.courseId,
					session
				);

				await this.updatePlayerPointsWithSession(
					challenge.playerTwoId._id,
					playerTwoPoints,
					'challenge_completion',
					`Challenge match - Score: ${playerTwoScore}/${
						playerTwoScoreData.totalQuestions || challenge.questions.length
					}`,
					challenge.courseId,
					session
				);
			});

			// Update ranks after transaction completes
			await this.updateAllRanks();
		} catch (error) {
			console.error('Error updating leaderboards:', error);
			throw new Error('Failed to update leaderboards');
		} finally {
			await session.endSession();
		}
	}

	calculateBonusPoints(scoreDataOne, scoreDataTwo) {
		const getPercentage = (data) =>
			data.percentage ||
			Math.round(((data.score || data) / (data.totalQuestions || 5)) * 100);

		const percentageOne = getPercentage(scoreDataOne);
		const percentageTwo = getPercentage(scoreDataTwo);

		const getBonusFromPercentage = (percentage) => {
			if (percentage === 100) return 20; // Perfect score
			if (percentage >= 90) return 15;
			if (percentage >= 80) return 10;
			if (percentage >= 70) return 5;
			return 0;
		};

		return {
			playerOne: getBonusFromPercentage(percentageOne),
			playerTwo: getBonusFromPercentage(percentageTwo),
		};
	}

	async updatePlayerPointsWithSession(
		studentId,
		points,
		activity,
		description,
		courseId,
		session
	) {
		let studentPoints = await StudentPoints.findOne({ studentId }).session(
			session
		);

		if (!studentPoints) {
			studentPoints = new StudentPoints({ studentId });
		}

		studentPoints.totalPoints += points;
		studentPoints.pointsHistory.push({
			activity,
			points,
			description,
			courseId,
			earnedAt: new Date(),
		});
		studentPoints.lastUpdated = new Date();

		return await studentPoints.save({ session });
	}

	async updatePlayerPoints(studentId, points, activity, description, courseId) {
		let studentPoints = await StudentPoints.findOne({ studentId });

		if (!studentPoints) {
			studentPoints = new StudentPoints({ studentId });
		}

		studentPoints.totalPoints += points;
		studentPoints.pointsHistory.push({
			activity,
			points,
			description,
			courseId,
			earnedAt: new Date(),
		});

		return await studentPoints.save();
	}

	async updateAllRanks() {
		const students = await StudentPoints.find().sort({ totalPoints: -1 });

		const updatePromises = students.map((student, index) => {
			student.rank = index + 1;
			return student.save();
		});

		await Promise.all(updatePromises);
	}

	async distributeRewards(challenge, result) {
		try {
			if (result.isDraw) {
				console.log('Match was a draw - distributing participation rewards');
				await this.distributeParticipationRewards(
					challenge.playerOneId,
					challenge.playerTwoId,
					challenge
				);
				return;
			}

			const winner =
				result.winnerId.toString() === challenge.playerOneId._id.toString()
					? challenge.playerOneId
					: challenge.playerTwoId;

			const loser =
				result.winnerId.toString() === challenge.playerOneId._id.toString()
					? challenge.playerTwoId
					: challenge.playerOneId;

			// Distribute winner rewards
			await this.distributeWinnerRewards(winner, challenge, result);

			// Distribute participation rewards for loser
			await this.distributeParticipationRewards(loser, null, challenge);

			// Mark rewards as distributed
			await ChallengeResult.findByIdAndUpdate(result._id, {
				rewardsDistributed: true,
				rewardDistributedAt: new Date(),
			});

			console.log(`Rewards distributed for challenge: ${challenge._id}`);
		} catch (error) {
			console.error('Error distributing rewards:', error);
			throw new Error('Failed to distribute rewards');
		}
	}

	async distributeWinnerRewards(winner, challenge, result) {
		try {
			// Token rewards (simulated - replace with actual smart contract integration)
			const tokenReward = this.calculateTokenReward(challenge, result);
			await this.allocateTokens(winner._id, tokenReward, 'challenge_victory');

			// NFT rewards for significant achievements
			if (winner.walletAddress && this.qualifiesForNFT(result)) {
				const metadata = {
					name: 'Quiz Challenge Victory NFT',
					description: `Victory in quiz challenge - ${challenge.courseId}`,
					attributes: [
						{ trait_type: 'Achievement', value: 'Challenge Winner' },
						{ trait_type: 'Course', value: challenge.courseId },
						{ trait_type: 'Date', value: new Date().toISOString() },
						{
							trait_type: 'Score',
							value: `${result.scoreComparison?.playerOneScore || 'N/A'}`,
						},
					],
				};

				const nftResult = await mintNFT(winner.walletAddress, metadata);
				console.log(`NFT minted for winner: ${winner._id} - ${nftResult}`);
			}

			// Record reward transaction for auditing
			await this.recordRewardTransaction(winner._id, challenge._id, {
				type: 'victory',
				tokens: tokenReward,
				nft: winner.walletAddress ? 'minted' : 'not_applicable',
				timestamp: new Date(),
			});
		} catch (error) {
			console.error('Error distributing winner rewards:', error);
			throw error;
		}
	}

	async distributeParticipationRewards(player, secondPlayer, challenge) {
		try {
			const participationTokens = 10; // Base participation reward

			await this.allocateTokens(
				player._id,
				participationTokens,
				'challenge_participation'
			);

			if (secondPlayer) {
				await this.allocateTokens(
					secondPlayer._id,
					participationTokens,
					'challenge_participation'
				);
			}
		} catch (error) {
			console.error('Error distributing participation rewards:', error);
		}
	}

	calculateTokenReward(challenge, result) {
		let baseReward = 100; // Base victory reward

		// Bonus for perfect score
		const winnerScore =
			result.scoreComparison?.playerOneScore ||
			result.scoreComparison?.playerTwoScore ||
			0;
		const totalQuestions = challenge.questions.length;
		if (winnerScore === totalQuestions) {
			baseReward += 50; // Perfect score bonus
		}

		// Time bonus for quick completion
		const maxTime = challenge.timeLimit || 300000; // 5 minutes default
		const actualTime = Math.min(
			result.scoreComparison?.playerOneTime || maxTime,
			result.scoreComparison?.playerTwoTime || maxTime
		);

		if (actualTime < maxTime * 0.5) {
			// Completed in less than half the time
			baseReward += 25;
		}

		return baseReward;
	}

	qualifiesForNFT(result) {
		// NFT qualification criteria
		const winnerScore = Math.max(
			result.scoreComparison?.playerOneScore || 0,
			result.scoreComparison?.playerTwoScore || 0
		);

		// Only award NFT for high performance (80% or above)
		return winnerScore >= 4; // Assuming 5 questions, 4+ correct
	}

	async allocateTokens(playerId, amount, reason) {
		try {
			// Get player's wallet address from user record
			const Student = require('../models/Student');
			const player = await Student.findById(playerId);

			if (!player) {
				throw new Error('Player not found');
			}

			if (!player.walletAddress) {
				console.log(
					`Player ${playerId} does not have a wallet address - tokens will be held in escrow`
				);
				// Store tokens in escrow for later claim
				return await this.storeTokensInEscrow(playerId, amount, reason);
			}

			// Use the token service to allocate tokens
			const result = await tokenService.allocateTokens(
				playerId,
				player.walletAddress,
				amount,
				reason
			);

			if (result.success) {
				console.log(
					`Successfully allocated ${amount} tokens to player ${playerId}`
				);
			} else {
				console.error(
					`Failed to allocate tokens to player ${playerId}:`,
					result.error
				);
			}

			return result;
		} catch (error) {
			console.error('Error in token allocation:', error);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	async storeTokensInEscrow(playerId, amount, reason) {
		// In production, this would store tokens in an escrow system
		console.log(
			`Storing ${amount} tokens in escrow for player ${playerId} - reason: ${reason}`
		);

		// Could store in database table for pending token allocations
		return {
			success: true,
			escrowed: true,
			amount,
			playerId,
			reason,
			claimable: true,
		};
	}

	async recordRewardTransaction(playerId, challengeId, rewardDetails) {
		// Record transaction for audit purposes
		// This could be stored in a separate RewardTransaction model
		console.log(`Reward transaction recorded:`, {
			playerId,
			challengeId,
			...rewardDetails,
		});
	}

	async sendNotifications(
		challenge,
		result,
		playerOneScoreData,
		playerTwoScoreData
	) {
		try {
			const playerOne = challenge.playerOneId;
			const playerTwo = challenge.playerTwoId;

			const playerOneScore = playerOneScoreData.score || playerOneScoreData;
			const playerTwoScore = playerTwoScoreData.score || playerTwoScoreData;
			const totalQuestions = challenge.questions.length;

			let resultMessage, winnerName;
			if (result.isDraw) {
				resultMessage = `The match ended in a draw! Both players scored ${playerOneScore}/${totalQuestions}`;
				winnerName = null;
			} else {
				winnerName =
					result.winnerId.toString() === playerOne._id.toString()
						? playerOne.name
						: playerTwo.name;
				resultMessage = `${winnerName} won the challenge! (${result.winnerReason})`;
			}

			// Enhanced email notifications with detailed results
			const emailPromises = [
				this.sendDetailedNotification(playerOne, {
					opponentName: playerTwo.name,
					playerScore: playerOneScore,
					opponentScore: playerTwoScore,
					totalQuestions,
					playerPercentage:
						playerOneScoreData.percentage ||
						Math.round((playerOneScore / totalQuestions) * 100),
					resultMessage,
					isWinner: result.winnerId?.toString() === playerOne._id.toString(),
					isDraw: result.isDraw,
					winnerReason: result.winnerReason,
					challengeId: challenge._id,
				}),
				this.sendDetailedNotification(playerTwo, {
					opponentName: playerOne.name,
					playerScore: playerTwoScore,
					opponentScore: playerOneScore,
					totalQuestions,
					playerPercentage:
						playerTwoScoreData.percentage ||
						Math.round((playerTwoScore / totalQuestions) * 100),
					resultMessage,
					isWinner: result.winnerId?.toString() === playerTwo._id.toString(),
					isDraw: result.isDraw,
					winnerReason: result.winnerReason,
					challengeId: challenge._id,
				}),
			];

			await Promise.all(emailPromises);

			// Mark notifications as sent
			await ChallengeResult.findOneAndUpdate(
				{ challengeId: challenge._id },
				{
					notificationsSent: true,
					notificationsSentAt: new Date(),
				}
			);

			console.log(`Notifications sent for challenge: ${challenge._id}`);
		} catch (error) {
			console.error('Error sending notifications:', error);
			// Don't throw here - notifications are not critical to challenge completion
		}
	}

	async sendDetailedNotification(player, details) {
		const {
			opponentName,
			playerScore,
			opponentScore,
			totalQuestions,
			playerPercentage,
			resultMessage,
			isWinner,
			isDraw,
			winnerReason,
			challengeId,
		} = details;

		const subject = isDraw
			? 'Quiz Challenge Results - Draw!'
			: isWinner
			? 'Quiz Challenge Results - You Won!'
			: 'Quiz Challenge Results - Match Complete';

		const emailBody = `
Hi ${player.name},

Your quiz challenge with ${opponentName} has been completed!

📊 MATCH RESULTS:
Your Score: ${playerScore}/${totalQuestions} (${playerPercentage}%)
Opponent's Score: ${opponentScore}/${totalQuestions}

🏆 OUTCOME:
${resultMessage}
${winnerReason ? `Reason: ${winnerReason}` : ''}

${
	isWinner
		? '🎉 Congratulations on your victory! You have earned bonus rewards.'
		: isDraw
		? '🤝 Great match! You both performed equally well.'
		: '💪 Good effort! Keep practicing and challenge again soon.'
}

📈 Check your updated leaderboard position and rewards in your dashboard.

Challenge ID: ${challengeId}

Best regards,
ChainVerse Team
		`.trim();

		await sendEmail(player.email, subject, emailBody);
	}

	async handleEvaluationError(challengeId, error) {
		try {
			console.error(`Challenge evaluation failed for ${challengeId}:`, error);

			// Update challenge with detailed error information
			await Challenge.findByIdAndUpdate(challengeId, {
				status: 'error',
				errorMessage: error.message,
				errorAt: new Date(),
				errorDetails: {
					stack: error.stack,
					type: error.constructor.name,
					timestamp: new Date().toISOString(),
				},
			});

			// Notify system administrators of evaluation failure
			await this.notifyAdministrators(challengeId, error);

			// Log error for monitoring systems
			this.logEvaluationError(challengeId, error);
		} catch (updateError) {
			console.error(
				'Failed to update challenge with error status:',
				updateError
			);
		}
	}

	async notifyAdministrators(challengeId, error) {
		try {
			const adminEmail = process.env.ADMIN_EMAIL;
			if (adminEmail) {
				await sendEmail(
					adminEmail,
					'Challenge Evaluation Error',
					`Challenge evaluation failed for ID: ${challengeId}\n\n` +
						`Error: ${error.message}\n\n` +
						`Time: ${new Date().toISOString()}\n\n` +
						`Please investigate and resolve this issue.`
				);
			}
		} catch (emailError) {
			console.error('Failed to notify administrators:', emailError);
		}
	}

	logEvaluationError(challengeId, error) {
		// In a production environment, this could integrate with monitoring services
		// like DataDog, New Relic, or custom logging solutions
		console.error('EVALUATION_ERROR', {
			challengeId,
			errorMessage: error.message,
			errorType: error.constructor.name,
			timestamp: new Date().toISOString(),
			stack: error.stack,
		});
	}

	async validateChallengeData(challenge) {
		const errors = [];

		if (!challenge.playerOneId || !challenge.playerTwoId) {
			errors.push('Challenge must have two valid players');
		}

		if (!challenge.questions || challenge.questions.length === 0) {
			errors.push('Challenge must have questions');
		}

		if (!challenge.courseId) {
			errors.push('Challenge must be associated with a course');
		}

		if (errors.length > 0) {
			throw new Error(`Challenge validation failed: ${errors.join(', ')}`);
		}

		return true;
	}

	async validateSubmissionData(submission) {
		const errors = [];

		if (!submission.answers || !Array.isArray(submission.answers)) {
			errors.push('Submission must contain answers array');
		}

		if (typeof submission.totalTime !== 'number' || submission.totalTime < 0) {
			errors.push('Submission must contain valid total time');
		}

		if (!submission.playerId) {
			errors.push('Submission must be associated with a player');
		}

		if (errors.length > 0) {
			throw new Error(`Submission validation failed: ${errors.join(', ')}`);
		}

		return true;
	}

	async getCourseLeaderboard(courseId, limit = 10) {
		try {
			const leaderboard = await StudentPoints.find({
				'pointsHistory.courseId': courseId,
			})
				.populate('studentId', 'name email')
				.sort({ totalPoints: -1 })
				.limit(limit);

			return leaderboard;
		} catch (error) {
			console.error('Error fetching course leaderboard:', error);
			throw error;
		}
	}

	async getGlobalLeaderboard(limit = 10) {
		try {
			const leaderboard = await StudentPoints.find()
				.populate('studentId', 'name email')
				.sort({ totalPoints: -1 })
				.limit(limit);

			return leaderboard;
		} catch (error) {
			console.error('Error fetching global leaderboard:', error);
			throw error;
		}
	}
}

module.exports = new ChallengeEvaluationService();
