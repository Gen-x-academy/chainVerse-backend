const mongoose = require("mongoose");

const BorrowSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    borrowedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["active", "expired", "returned", "completed"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

BorrowSchema.index({ userId: 1, status: 1 });
BorrowSchema.index({ userId: 1, expiresAt: 1 });

BorrowSchema.methods.isExpired = function () {
  return this.expiresAt < new Date() && this.status === "active";
};

BorrowSchema.methods.getRemainingTime = function () {
  const now = new Date();
  const remaining = this.expiresAt - now;
  return Math.max(0, Math.floor(remaining / 1000));
};

module.exports = mongoose.model("Borrow", BorrowSchema);
