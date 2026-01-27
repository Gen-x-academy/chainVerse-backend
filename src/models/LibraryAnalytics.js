const mongoose = require("mongoose");

const LibraryAnalyticsSchema = new mongoose.Schema(
  {
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly", "all-time"],
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    metrics: {
      totalBorrows: { type: Number, default: 0 },
      activeReaders: { type: Number, default: 0 },
      mostBorrowedBooks: [
        {
          bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
          title: String,
          count: { type: Number, default: 0 },
        },
      ],
      completionRates: {
        averageProgress: { type: Number, default: 0 },
        completedCount: { type: Number, default: 0 },
      },
      courseLinkedEngagement: [
        {
          courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
          courseTitle: String,
          borrowCount: { type: Number, default: 0 },
          completionRate: { type: Number, default: 0 },
        },
      ],
    },
  },
  {
    timestamps: true,
  },
);

// Index for quick retrieval of latest stats per period
LibraryAnalyticsSchema.index({ period: 1, date: -1 });

module.exports = mongoose.model("LibraryAnalytics", LibraryAnalyticsSchema);
