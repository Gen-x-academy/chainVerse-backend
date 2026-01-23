const mongoose = require('mongoose');

const CertificateNameChangeRequestSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Certificate',
    required: false
  },
  newFullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 500
  },
  supportingDocumentUrl: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  requestedDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  reviewedDate: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Index for efficient querying
CertificateNameChangeRequestSchema.index({ studentId: 1, status: 1 });
CertificateNameChangeRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CertificateNameChangeRequest', CertificateNameChangeRequestSchema);
