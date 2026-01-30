const mongoose = require("mongoose");

const BookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  author: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
    index: true,
  },
  tags: {
    type: [String],
    default: [],
    index: true,
  },
  description: {
    type: String,
    trim: true,
  },
  coverImage: {
    type: String, // URL
    trim: true,
  },
  link: {
    type: String, // External link to purchase or read
    trim: true,
  },
  isbn: {
    type: String,
    trim: true,
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  totalReviews: {
    type: Number,
    default: 0,
  },
  ratingDistribution: {
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 },
  },
  // Report content moderation status
  reportStatus: {
    type: String,
    enum: ["active", "under_review", "removed"],
    default: "active",
    index: true,
  },
  reportCount: {
    type: Number,
    default: 0,
  },
  lastReportedAt: {
    type: Date,
  },
  moderationNotes: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

BookSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

BookSchema.index({ title: "text", author: "text", description: "text" });
BookSchema.index({ category: 1, isActive: 1 });
// Full-text search index (title/author/tags/category/description)
BookSchema.index({
  title: "text",
  author: "text",
  description: "text",
  tags: "text",
  category: "text",
});
// Index for report moderation queries
BookSchema.index({ reportStatus: 1, reportCount: -1 });

module.exports = mongoose.model("Book", BookSchema);
