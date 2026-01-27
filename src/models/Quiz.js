const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Option Schema
const optionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    text: { type: String, required: true, maxlength: 200, trim: true },
    isCorrect: { type: Boolean, required: true },
  },
  { _id: false },
);

// Question Schema
const questionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    text: { type: String, required: true, maxlength: 500, trim: true },
    options: {
      type: [optionSchema],
      validate: [
        {
          validator: (options) => options.length >= 2 && options.length <= 5,
          message: "Each question must have between 2 and 5 options",
        },
        {
          validator: (options) => options.some((option) => option.isCorrect),
          message: "Each question must have at least one correct option",
        },
        {
          validator: (options) => {
            const texts = options.map((option) =>
              option.text.toLowerCase().trim(),
            );
            return texts.length === new Set(texts).size;
          },
          message: "Options within a question must be unique",
        },
      ],
    },
    explanation: { type: String, maxlength: 1000, trim: true },
  },
  { _id: false },
);

// Main Quiz Schema
const quizSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    courseId: {
      type: String,
      required: true,
      validate: {
        validator: (v) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            v,
          ),
        message: "Course ID must be a valid UUID",
      },
    },
    moduleId: {
      type: String,
      required: true,
      validate: {
        validator: (v) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            v,
          ),
        message: "Module ID must be a valid UUID",
      },
    },
    title: { type: String, required: true, maxlength: 200, trim: true },
    description: { type: String, maxlength: 1000, trim: true },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (questions) => questions.length >= 5,
        message: "Quiz must have at least 5 questions",
      },
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
  },
  {
    timestamps: true,
  },
);

quizSchema.index({ courseId: 1, moduleId: 1 });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ isActive: 1 });

// Optimistic concurrency (optional)
quizSchema.set("optimisticConcurrency", true);

// Soft delete (cascade delete quiz attempts here if needed)
// quizSchema.pre('remove', async function(next) {
//   await mongoose.model('QuizAttempt').deleteMany({ quizId: this._id });
//   next();
// });

quizSchema.pre("save", function (next) {
  if (this.isModified() && !this.isNew) this.version += 1;
  next();
});

module.exports = mongoose.model("Quiz", quizSchema);
