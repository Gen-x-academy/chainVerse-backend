const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Challenge = require('../../src/models/Challenge');
const ChallengeSubmission = require('../../src/models/ChallengeSubmission');
const ChallengeResult = require('../../src/models/ChallengeResult');
const Student = require('../../src/models/Student');
const ChallengeEvaluationService = require('../../src/services/ChallengeEvaluationService');

describe('Challenge Evaluation System', () => {
	let playerOne, playerTwo, challenge, authTokenOne, authTokenTwo;

	beforeAll(async () => {
		// Connect to test database
		await mongoose.connect(
			process.env.TEST_DATABASE_URL ||
				'mongodb://localhost:27017/chainverse-test'
		);
	});

	beforeEach(async () => {
		// Clean up database
		await Challenge.deleteMany({});
		await ChallengeSubmission.deleteMany({});
		await ChallengeResult.deleteMany({});
		await Student.deleteMany({});

		// Create test players
		playerOne = await Student.create({
			name: 'Player One',
			email: 'player1@test.com',
			password: 'password123',
			walletAddress: '0x1234567890123456789012345678901234567890',
		});

		playerTwo = await Student.create({
			name: 'Player Two',
			email: 'player2@test.com',
			password: 'password123',
			walletAddress: '0x0987654321098765432109876543210987654321',
		});

		// Create test challenge
		challenge = await Challenge.create({
			playerOneId: playerOne._id,
			playerTwoId: playerTwo._id,
			quizId: 'test-quiz-id',
			courseId: 'test-course-id',
			moduleId: 'test-module-id',
			questions: [
				{
					questionId: 'q1',
					text: 'What is 2 + 2?',
					options: [
						{ _id: 'a', text: '3', isCorrect: false },
						{ _id: 'b', text: '4', isCorrect: true },
						{ _id: 'c', text: '5', isCorrect: false },
					],
					correctOptionId: 'b',
				},
				{
					questionId: 'q2',
					text: 'What is the capital of France?',
					options: [
						{ _id: 'a', text: 'London', isCorrect: false },
						{ _id: 'b', text: 'Berlin', isCorrect: false },
						{ _id: 'c', text: 'Paris', isCorrect: true },
					],
					correctOptionId: 'c',
				},
				{
					questionId: 'q3',
					text: 'What color is the sky?',
					options: [
						{ _id: 'a', text: 'Blue', isCorrect: true },
						{ _id: 'b', text: 'Green', isCorrect: false },
						{ _id: 'c', text: 'Red', isCorrect: false },
					],
					correctOptionId: 'a',
				},
				{
					questionId: 'q4',
					text: 'How many sides does a triangle have?',
					options: [
						{ _id: 'a', text: '2', isCorrect: false },
						{ _id: 'b', text: '3', isCorrect: true },
						{ _id: 'c', text: '4', isCorrect: false },
					],
					correctOptionId: 'b',
				},
				{
					questionId: 'q5',
					text: 'What is 10 / 2?',
					options: [
						{ _id: 'a', text: '4', isCorrect: false },
						{ _id: 'b', text: '5', isCorrect: true },
						{ _id: 'c', text: '6', isCorrect: false },
					],
					correctOptionId: 'b',
				},
			],
			status: 'pending',
		});

		// Generate auth tokens (mocked)
		authTokenOne = 'mock-token-player-one';
		authTokenTwo = 'mock-token-player-two';
	});

	afterAll(async () => {
		await mongoose.connection.close();
	});

	describe('Score Calculation', () => {
		test('should calculate correct score for perfect answers', async () => {
			const submission = {
				answers: [
					{ questionId: 'q1', selectedOption: 'b' },
					{ questionId: 'q2', selectedOption: 'c' },
					{ questionId: 'q3', selectedOption: 'a' },
					{ questionId: 'q4', selectedOption: 'b' },
					{ questionId: 'q5', selectedOption: 'b' },
				],
			};

			const result = await ChallengeEvaluationService.calculateScore(
				submission,
				challenge.questions
			);

			expect(result.score).toBe(5);
			expect(result.totalQuestions).toBe(5);
			expect(result.percentage).toBe(100);
			expect(result.detailedResults).toHaveLength(5);
			expect(result.detailedResults.every((r) => r.isCorrect)).toBe(true);
		});

		test('should calculate correct score for partial answers', async () => {
			const submission = {
				answers: [
					{ questionId: 'q1', selectedOption: 'b' }, // correct
					{ questionId: 'q2', selectedOption: 'a' }, // wrong
					{ questionId: 'q3', selectedOption: 'a' }, // correct
					{ questionId: 'q4', selectedOption: 'a' }, // wrong
					{ questionId: 'q5', selectedOption: 'b' }, // correct
				],
			};

			const result = await ChallengeEvaluationService.calculateScore(
				submission,
				challenge.questions
			);

			expect(result.score).toBe(3);
			expect(result.percentage).toBe(60);
			expect(result.detailedResults.filter((r) => r.isCorrect)).toHaveLength(3);
		});
	});

	describe('Winner Determination', () => {
		test('should determine winner based on higher score', async () => {
			const result = ChallengeEvaluationService.determineWinner(
				playerOne._id,
				playerTwo._id,
				{ score: 4 },
				{ score: 2 },
				30000,
				25000
			);

			expect(result.winnerId.toString()).toBe(playerOne._id.toString());
			expect(result.isDraw).toBe(false);
			expect(result.winnerReason).toBe('Higher score');
		});

		test('should use time as tiebreaker when scores are equal', async () => {
			const result = ChallengeEvaluationService.determineWinner(
				playerOne._id,
				playerTwo._id,
				{ score: 3 },
				{ score: 3 },
				25000, // faster
				30000
			);

			expect(result.winnerId.toString()).toBe(playerOne._id.toString());
			expect(result.isDraw).toBe(false);
			expect(result.winnerReason).toBe('Faster completion time (tiebreaker)');
		});

		test('should declare draw when score and time are identical', async () => {
			const result = ChallengeEvaluationService.determineWinner(
				playerOne._id,
				playerTwo._id,
				{ score: 3 },
				{ score: 3 },
				30000,
				30000
			);

			expect(result.winnerId).toBeNull();
			expect(result.isDraw).toBe(true);
			expect(result.winnerReason).toBe(
				'Perfect tie - same score and completion time'
			);
		});
	});

	describe('Full Challenge Evaluation', () => {
		test('should evaluate challenge successfully when both players submit', async () => {
			// Create submissions
			await ChallengeSubmission.create({
				challengeId: challenge._id,
				playerId: playerOne._id,
				answers: [
					{ questionId: 'q1', selectedOption: 'b' },
					{ questionId: 'q2', selectedOption: 'c' },
					{ questionId: 'q3', selectedOption: 'a' },
					{ questionId: 'q4', selectedOption: 'b' },
					{ questionId: 'q5', selectedOption: 'b' },
				],
				totalTime: 25000,
			});

			await ChallengeSubmission.create({
				challengeId: challenge._id,
				playerId: playerTwo._id,
				answers: [
					{ questionId: 'q1', selectedOption: 'a' },
					{ questionId: 'q2', selectedOption: 'c' },
					{ questionId: 'q3', selectedOption: 'a' },
					{ questionId: 'q4', selectedOption: 'b' },
					{ questionId: 'q5', selectedOption: 'a' },
				],
				totalTime: 30000,
			});

			const result = await ChallengeEvaluationService.evaluateChallenge(
				challenge._id
			);

			expect(result).toBeDefined();
			expect(result.playerOneScore).toBe(5);
			expect(result.playerTwoScore).toBe(3);
			expect(result.winnerId.toString()).toBe(playerOne._id.toString());

			// Check challenge status updated
			const updatedChallenge = await Challenge.findById(challenge._id);
			expect(updatedChallenge.status).toBe('completed');
			expect(updatedChallenge.completedAt).toBeDefined();
		});

		test('should handle evaluation errors gracefully', async () => {
			// Try to evaluate challenge without submissions
			await expect(
				ChallengeEvaluationService.evaluateChallenge(challenge._id)
			).rejects.toThrow('Both players must submit before evaluation');

			// Check error status was recorded
			const updatedChallenge = await Challenge.findById(challenge._id);
			expect(updatedChallenge.status).toBe('error');
			expect(updatedChallenge.errorMessage).toBeDefined();
		});
	});

	describe('Security and Validation', () => {
		test('should validate submission data format', async () => {
			const invalidSubmission = {
				answers: 'invalid', // should be array
				totalTime: -1, // should be positive
			};

			await expect(
				ChallengeEvaluationService.validateSubmissionData(invalidSubmission)
			).rejects.toThrow('Submission validation failed');
		});

		test('should prevent duplicate submissions', async () => {
			// First submission
			await ChallengeSubmission.create({
				challengeId: challenge._id,
				playerId: playerOne._id,
				answers: [
					{ questionId: 'q1', selectedOption: 'b' },
					{ questionId: 'q2', selectedOption: 'c' },
					{ questionId: 'q3', selectedOption: 'a' },
					{ questionId: 'q4', selectedOption: 'b' },
					{ questionId: 'q5', selectedOption: 'b' },
				],
				totalTime: 25000,
			});

			// Attempt duplicate submission
			await expect(
				ChallengeSubmission.create({
					challengeId: challenge._id,
					playerId: playerOne._id,
					answers: [
						{ questionId: 'q1', selectedOption: 'a' },
						{ questionId: 'q2', selectedOption: 'c' },
						{ questionId: 'q3', selectedOption: 'a' },
						{ questionId: 'q4', selectedOption: 'b' },
						{ questionId: 'q5', selectedOption: 'b' },
					],
					totalTime: 30000,
				})
			).rejects.toThrow();
		});
	});

	describe('Reward Distribution', () => {
		test('should calculate appropriate token rewards', async () => {
			const challengeResult = {
				isWinner: true,
				timeLimit: 300000,
			};

			const playerPerformance = {
				score: 5,
				totalQuestions: 5,
				time: 150000, // Half the time limit
			};

			const tokenService = require('../../src/services/tokenService');
			const reward = tokenService.calculateChallengeReward(
				challengeResult,
				playerPerformance
			);

			expect(reward).toBeGreaterThan(100); // Base reward
			expect(reward).toBeGreaterThan(200); // Should include victory, perfect score, and speed bonuses
		});
	});

	describe('Leaderboard Updates', () => {
		test('should update player points correctly', async () => {
			const StudentPoints = require('../../src/models/studentPoints');

			// Mock player points
			await StudentPoints.create({
				studentId: playerOne._id,
				totalPoints: 100,
			});

			await ChallengeEvaluationService.updatePlayerPointsWithSession(
				playerOne._id,
				50,
				'challenge_victory',
				'Won a challenge',
				challenge.courseId,
				null // No session for test
			);

			const updatedPoints = await StudentPoints.findOne({
				studentId: playerOne._id,
			});
			expect(updatedPoints.totalPoints).toBe(150);
			expect(updatedPoints.pointsHistory).toHaveLength(1);
		});
	});
});
