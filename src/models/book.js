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

// Full-text search index (title/author/tags/category/description)
BookSchema.index({
  title: "text",
  author: "text",
  description: "text",
  tags: "text",
  category: "text",
});

module.exports = mongoose.model("Book", BookSchema);
