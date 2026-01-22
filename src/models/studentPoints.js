const mongoose = require('mongoose');

const StudentPointsSchema = new mongoose.Schema(
	{
		studentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Student',
			required: true,
			unique: true,
		},
		totalPoints: {
			type: Number,
			default: 0,
			min: 0,
		},
		pointsHistory: [
			{
				activity: {
					type: String,
					required: true,
					enum: [
						'course_completion',
						'quiz_completion',
						'assignment_completion',
						'badge_earned',
						'milestone_reached',
						'challenge_completion',
						'challenge_victory',
						'challenge_participation',
					],
				},
				points: {
					type: Number,
					required: true,
				},
				description: {
					type: String,
					required: true,
				},
				courseId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'Course',
				},
				earnedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],
		rank: {
			type: Number,
			default: null,
		},
		lastUpdated: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
);

// Index for efficient leaderboard queries
StudentPointsSchema.index({ totalPoints: -1 });
StudentPointsSchema.index({ studentId: 1 });

// Update rank when points change
StudentPointsSchema.pre('save', function (next) {
	this.lastUpdated = Date.now();
	next();
});

module.exports = mongoose.model('StudentPoints', StudentPointsSchema);
