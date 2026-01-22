const mongoose = require('mongoose');

const ChallengeQuestionSchema = new mongoose.Schema(
	{
		questionId: {
			type: String, // Using String ID to match Quiz question IDs
			required: true,
		},
		text: {
			type: String,
			required: true,
		},
		options: [
			{
				_id: String,
				text: String,
				isCorrect: Boolean,
			},
		],
		correctOptionId: {
			type: String,
			required: true,
		},
		explanation: String,
	},
	{ _id: false }
);

const ChallengeSchema = new mongoose.Schema({
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
	quizId: {
		type: String,
		ref: 'Quiz',
		required: true,
	},
	courseId: {
		type: String,
		required: true,
	},
	moduleId: {
		type: String,
		required: true,
	},
	questions: {
		type: [ChallengeQuestionSchema],
		validate: {
			validator: function (questions) {
				return questions.length >= 5;
			},
			message: 'Challenge must have at least 5 questions',
		},
	},
	status: {
		type: String,
		enum: ['pending', 'in_progress', 'completed', 'expired', 'error'],
		default: 'pending',
	},
	timeLimit: {
		type: Number,
		default: 300000, // 5 minutes in milliseconds
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	startedAt: Date,
	completedAt: Date,
	expiresAt: {
		type: Date,
		default: function () {
			return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from creation
		},
	},
	errorMessage: String,
	errorAt: Date,
});

// Indexes for efficient queries
ChallengeSchema.index({ playerOneId: 1 });
ChallengeSchema.index({ playerTwoId: 1 });
ChallengeSchema.index({ status: 1 });
ChallengeSchema.index({ quizId: 1 });
ChallengeSchema.index({ courseId: 1 });
ChallengeSchema.index({ createdAt: -1 });
ChallengeSchema.index({ expiresAt: 1 }); // For cleanup operations

module.exports = mongoose.model('Challenge', ChallengeSchema);
