const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    dueDate: {
        type: Date,
        required: true,
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
    },
    tutorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tutor",
        required: true,
    },
    resources: [
        {
            type: String,
            trim: true,
        },
    ],
    maxScore: {
        type: Number,
        default: 100,
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

AssignmentSchema.pre("save", function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model("Assignment", AssignmentSchema);
