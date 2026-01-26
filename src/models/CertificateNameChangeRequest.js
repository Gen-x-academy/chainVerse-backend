const mongoose = require("mongoose");

const CertificateNameChangeRequestSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Certificate",
    required: false
  },
  currentName: {
    type: String,
    required: false,
  },
  requestedName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  // Alias for compatibility
  newFullName: {
    type: String,
    get: function() {
      return this.requestedName;
    },
    set: function(v) {
      this.requestedName = v;
    }
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 500
  },
  supportingDocuments: [
    {
      type: String, // URLs or paths to documents
    },
  ],
  supportingDocumentUrl: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
    index: true
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  requestedDate: {
    type: Date,
    get: function() {
      return this.submittedAt;
    }
  },
  reviewedAt: {
    type: Date,
  },
  reviewedDate: {
    type: Date,
    get: function() {
      return this.reviewedAt;
    }
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  feedback: {
    type: String,
    trim: true,
    maxlength: 500
  },
  adminNotes: {
    type: String,
    get: function() {
      return this.feedback;
    },
    set: function(v) {
      this.feedback = v;
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Index for efficient querying
CertificateNameChangeRequestSchema.index({ studentId: 1, status: 1 });
CertificateNameChangeRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
  "CertificateNameChangeRequest",
  CertificateNameChangeRequestSchema
);
