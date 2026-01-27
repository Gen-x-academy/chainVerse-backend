
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const CertificateSchema = new mongoose.Schema({
  // Core certificate fields
  certificateId: {
    type: String,
    unique: true,
    default: () => uuidv4(),
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  // Required certificate data
  studentFullName: {
    type: String,
    required: true
  },
  courseTitle: {
    type: String,
    required: true
  },
  completionDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  issuedBy: {
    type: String,
    default: 'ChainVerse Academy',
    required: true
  },
  courseInstructorName: {
    type: String,
    required: true
  },
  verificationLink: {
    type: String,
    unique: true,
    required: true
  },
  // Additional fields
  certificateHash: {
    type: String,
    unique: true,
    sparse: true // Allows multiple documents with undefined/null values
  },
  web3Badge: {
    type: Boolean,
    default: false
  },
  certificateDesign: {
    type: String,
    default: 'web3-themed'
  },
  // Status and metadata
  status: {
    type: String,
    enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
    default: 'ACTIVE'
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  // File storage references
  certificateUrl: {
    type: String // URL to PDF version
  },
  imageUrl: {
    type: String // URL to image version
  },
  // Security
  publicHash: {
    type: String,
    unique: true,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
CertificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true }); // One certificate per student per course
CertificateSchema.index({ certificateId: 1 });
CertificateSchema.index({ publicHash: 1 });

module.exports = mongoose.model('Certificate', CertificateSchema);

// const mongoose = require("mongoose");

// const CertificateSchema = new mongoose.Schema({
//   tutorId: { type: mongoose.Schema.Types.ObjectId, ref: "Tutor" },
//   studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
//   courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
//   studentName: { type: String, required: true },
//   issueDate: Date,
// });

module.exports = mongoose.models.Certificate || mongoose.model("Certificate", CertificateSchema);


// const mongoose = require('mongoose');
// const { v4: uuidv4 } = require('uuid');

// const CertificateSchema = new mongoose.Schema({
//   // Core certificate fields
//   certificateId: {
//     type: String,
//     unique: true,
//     default: () => uuidv4(),
//     required: true
//   },
//   studentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Student',
//     required: true
//   },
//   courseId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Course',
//     required: true
//   },
//   // Required certificate data
//   studentFullName: {
//     type: String,
//     required: true
//   },
//   courseTitle: {
//     type: String,
//     required: true
//   },
//   completionDate: {
//     type: Date,
//     default: Date.now,
//     required: true
//   },
//   issuedBy: {
//     type: String,
//     default: 'ChainVerse Academy',
//     required: true
//   },
//   courseInstructorName: {
//     type: String,
//     required: true
//   },
//   verificationLink: {
//     type: String,
//     unique: true,
//     required: true
//   },
//   // Additional fields
//   certificateHash: {
//     type: String,
//     unique: true,
//     sparse: true
//   },
//   web3Badge: {
//     type: Boolean,
//     default: false
//   },
//   certificateDesign: {
//     type: String,
//     default: 'web3-themed'
//   },
//   // Add tutorId from the second schema if needed
//   tutorId: { 
//     type: mongoose.Schema.Types.ObjectId, 
//     ref: "Tutor" 
//   },
//   // Status and metadata
//   status: {
//     type: String,
//     enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
//     default: 'ACTIVE'
//   },
//   issueDate: {
//     type: Date,
//     default: Date.now
//   },
//   // File storage references
//   certificateUrl: {
//     type: String
//   },
//   imageUrl: {
//     type: String
//   },
//   // Security
//   publicHash: {
//     type: String,
//     unique: true,
//     required: true
//   }
// }, {
//   timestamps: true
// });

// // Indexes for performance
// CertificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
// CertificateSchema.index({ certificateId: 1 });
// CertificateSchema.index({ publicHash: 1 });

// module.exports = mongoose.model('Certificate', CertificateSchema);