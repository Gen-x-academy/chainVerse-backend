const mongoose = require('mongoose');

const ChallengeResultSchema = new mongoose.Schema({
	challengeId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Challenge',
		required: true,
		unique: true,
	},
	playerOneId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Student',
		required: true,
	},
	playerTwoId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Student',
		required: true,
	},
	playerOneScore: {
		type: Number,
		required: true,
		min: 0,
	},
	playerTwoScore: {
		type: Number,
		required: true,
		min: 0,
	},
	playerOneTime: {
		type: Number,
		required: true,
		min: 0,
	},
	playerTwoTime: {
		type: Number,
		required: true,
		min: 0,
	},
	winnerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Student',
		default: null, // null for draw
	},
	isDraw: {
		type: Boolean,
		default: false,
	},
	winnerReason: {
		type: String,
		default: '',
	},
	playerOnePercentage: {
		type: Number,
		min: 0,
		max: 100,
	},
	playerTwoPercentage: {
		type: Number,
		min: 0,
		max: 100,
	},
	detailedResults: {
		playerOne: [
			{
				questionId: String,
				selectedOption: String,
				correctOption: String,
				isCorrect: Boolean,
				questionText: String,
			},
		],
		playerTwo: [
			{
				questionId: String,
				selectedOption: String,
				correctOption: String,
				isCorrect: Boolean,
				questionText: String,
			},
		],
	},
	auditTrail: {
		evaluationTimestamp: Date,
		evaluationMethod: {
			type: String,
			default: 'automatic',
		},
		dataIntegrityHash: String,
	},
	evaluatedAt: {
		type: Date,
		default: Date.now,
	},
	completedAt: {
		type: Date,
		default: Date.now,
	},
	rewardsDistributed: {
		type: Boolean,
		default: false,
	},
	rewardDistributedAt: {
		type: Date,
	},
	notificationsSent: {
		type: Boolean,
		default: false,
	},
	notificationsSentAt: {
		type: Date,
	},
});

// Index for efficient queries
ChallengeResultSchema.index({ challengeId: 1 });
ChallengeResultSchema.index({ playerOneId: 1 });
ChallengeResultSchema.index({ playerTwoId: 1 });
ChallengeResultSchema.index({ winnerId: 1 });
ChallengeResultSchema.index({ completedAt: -1 });
ChallengeResultSchema.index({ rewardsDistributed: 1 });
ChallengeResultSchema.index({ notificationsSent: 1 });

module.exports = mongoose.model('ChallengeResult', ChallengeResultSchema);

module.exports = mongoose.model('ChallengeResult', ChallengeResultSchema);
