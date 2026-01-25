const mongoose = require("mongoose");

const borrowSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
      enum: ["course", "book", "material", "equipment"],
      required: true,
    },
    resourceTitle: {
      type: String,
      required: true,
    },
    borrowDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    returnDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "returned", "expired", "overdue"],
      default: "active",
      index: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    autoReturned: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
borrowSchema.index({ userId: 1, status: 1 });
borrowSchema.index({ expiryDate: 1, status: 1 });
borrowSchema.index({ userId: 1, resourceId: 1, status: 1 });

// Virtual for checking if borrow is expired
borrowSchema.virtual("isExpired").get(function () {
  return this.status === "active" && new Date() > this.expiryDate;
});

// Method to check if reminder should be sent
borrowSchema.methods.shouldSendReminder = function () {
  if (this.reminderSent || this.status !== "active") {
    return false;
  }

  const hoursUntilExpiry = (this.expiryDate - new Date()) / (1000 * 60 * 60);
  return hoursUntilExpiry <= 24 && hoursUntilExpiry > 0;
};

// Method to calculate hours remaining
borrowSchema.methods.getHoursRemaining = function () {
  const hoursRemaining = (this.expiryDate - new Date()) / (1000 * 60 * 60);
  return Math.max(0, Math.ceil(hoursRemaining));
};

module.exports = mongoose.model("Borrow", borrowSchema);
