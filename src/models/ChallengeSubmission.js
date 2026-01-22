const mongoose = require('mongoose');

const ChallengeSubmissionSchema = new mongoose.Schema({
	challengeId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Challenge',
		required: true,
	},
	playerId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Student',
		required: true,
	},
	answers: [
		{
			questionId: {
				type: String,
				required: true,
			},
			selectedOption: {
				type: String,
				required: true,
			},
		},
	],
	totalTime: {
		type: Number,
		required: true,
		min: 0,
	},
	submittedAt: {
		type: Date,
		default: Date.now,
	},
	submissionMetadata: {
		ipAddress: String,
		userAgent: String,
		timestamp: Date,
	},
});

// Compound index to ensure one submission per player per challenge
ChallengeSubmissionSchema.index(
	{ challengeId: 1, playerId: 1 },
	{ unique: true }
);

// Additional indexes for performance
ChallengeSubmissionSchema.index({ challengeId: 1, submittedAt: -1 });
ChallengeSubmissionSchema.index({ playerId: 1, submittedAt: -1 });

module.exports = mongoose.model(
	'ChallengeSubmission',
	ChallengeSubmissionSchema
);
