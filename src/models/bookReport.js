const mongoose = require('mongoose');

const bookReportSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
      index: true
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    reason: {
      type: String,
      enum: ['outdated', 'copyright', 'quality_issue', 'offensive', 'other'],
      required: true
    },
    description: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 1000
    },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'resolved', 'dismissed'],
      default: 'pending',
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    adminNotes: {
      type: String,
      maxlength: 2000,
      default: ''
    },
    resolution: {
      type: String,
      enum: ['no_action', 'content_updated', 'book_removed', 'warning_issued', null],
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for preventing duplicate reports from same user for same book
bookReportSchema.index({ book: 1, reporter: 1 }, { unique: true });

// Index for admin filtering
bookReportSchema.index({ status: 1, priority: 1, createdAt: -1 });

// Virtual for checking if report is resolved
bookReportSchema.virtual('isResolved').get(function () {
  return this.status === 'resolved' || this.status === 'dismissed';
});

// Pre-save middleware to set reviewedAt when status changes to resolved/dismissed
bookReportSchema.pre('save', function (next) {
  if (this.isModified('status') && (this.status === 'resolved' || this.status === 'dismissed')) {
    this.reviewedAt = new Date();
  }
  next();
});

const BookReport = mongoose.model('BookReport', bookReportSchema);

module.exports = BookReport;
