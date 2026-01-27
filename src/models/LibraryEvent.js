const mongoose = require("mongoose");

const LibraryEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["BORROW", "RETURN", "PROGRESS_UPDATE", "COMPLETE", "RATE"],
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["book", "course"],
      default: "book",
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
    },
    metadata: {
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
      device: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for time-based aggregation
LibraryEventSchema.index({ action: 1, createdAt: -1 });
LibraryEventSchema.index({ resourceId: 1, action: 1 });

module.exports = mongoose.model("LibraryEvent", LibraryEventSchema);
