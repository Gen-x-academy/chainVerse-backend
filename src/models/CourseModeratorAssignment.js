const mongoose = require('mongoose');

const CourseModeratorAssignmentSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  moderatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Compound index for efficient queries
CourseModeratorAssignmentSchema.index({ courseId: 1, moderatorId: 1 });
CourseModeratorAssignmentSchema.index({ moderatorId: 1, isActive: 1 });

module.exports = mongoose.model('CourseModeratorAssignment', CourseModeratorAssignmentSchema);