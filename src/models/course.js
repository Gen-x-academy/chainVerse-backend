const mongoose = require("mongoose");

const CourseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tutor",
    required: true,
  },
  tutorEmail: {
    type: String,
    required: true,
  },
  tutorName: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: false,
  },
  tags: [
    {
      type: String,
      trim: true,
    },
  ],
  duration: {
    type: Number,
    type: String, // e.g. "4 weeks"
    required: false,
  },
  prerequisites: [
    {
      type: String,
      trim: true
    }
  ],
  resources: [
    {
      type: String, // URL or description
      trim: true
    }
  ],
  level: {
    type: String,
    enum: ["Beginner", "Intermediate", "Advanced"],
    default: "Beginner",
  },
  price: {
    type: Number,
    default: 0,
  },
  thumbnail: {
    type: String,
    required: false,
  },
  videos: [
    {
      title: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      duration: {
        type: Number,
        required: false,
      },
      order: {
        type: Number,
        required: true,
      },
      recommendedBooks: [
        {
          book: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
          },
          required: {
            type: Boolean,
            default: false,
          },
          priority: {
            type: Number,
            default: 0,
          },
        },
      ],
    },
  ],
  recommendedBooks: [
    {
      book: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Book",
      },
      required: {
        type: Boolean,
        default: false,
      },
      priority: {
        type: Number,
        default: 0,
      },
    },
  ],
  enrollments: [
    {
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      enrolledAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  status: {
    type: String,
    enum: [
      "draft",
      "pending",
      "approved",
      "rejected",
      "published",
      "unpublished",
    ],
    default: "draft",
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  reviewedAt: {
    type: Date,
    required: false,
  },
  rejectionReason: {
    type: String,
    required: false,
  },
  studentProgress: {
    type: Map,
    of: Number,
    default: {},
  },
  completionDates: {
    type: Map,
    of: Date,
    default: {},
  },
  quizResults: {
    type: Map,
    of: Map,
    default: {},
  },
  totalEnrollments: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  prerequisite: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: false,
  },
  totalRatings: {
    type: Number,
    default: 0,
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

CourseSchema.index({ tutor: 1 });
CourseSchema.index({ status: 1 });
CourseSchema.index({ isPublished: 1 });
CourseSchema.index({ category: 1 });
CourseSchema.index({ level: 1 });
CourseSchema.index({ price: 1 });
CourseSchema.index({ rating: -1 });
CourseSchema.index({ totalEnrollments: -1 });

CourseSchema.index({ title: "text", description: "text", tutorName: "text" });

CourseSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

CourseSchema.pre("save", function (next) {
  if (this.isModified("enrollments")) {
    this.totalEnrollments = this.enrollments.length;
  }
  next();
});

module.exports = mongoose.model("Course", CourseSchema);
