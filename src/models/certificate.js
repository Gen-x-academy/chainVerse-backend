const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  issueDate: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'REVOKED', 'EXPIRED'], 
    default: 'ACTIVE' 
  },
  certificateUrl: { type: String },
  imageUrl: { type: String },
  publicHash: { type: String, unique: true, sparse: true },
  downloadToken: { type: String },
  downloadTokenExpiry: { type: Number },
}, {
  timestamps: true
});

// Index for faster queries
CertificateSchema.index({ studentId: 1, status: 1 });
CertificateSchema.index({ courseId: 1 });
CertificateSchema.index({ publicHash: 1 });

module.exports = mongoose.model('Certificate', CertificateSchema);
