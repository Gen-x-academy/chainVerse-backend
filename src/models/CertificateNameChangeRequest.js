const mongoose = require("mongoose");

const CertificateNameChangeRequestSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Certificate",
    required: true,
  },
  currentName: {
    type: String,
    required: true,
  },
  requestedName: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  supportingDocuments: [
    {
      type: String, // URLs or paths to documents
    },
  ],
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  reviewedAt: {
    type: Date,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Assuming admin is a User
  },
  feedback: {
    type: String,
  },
});

module.exports = mongoose.model(
  "CertificateNameChangeRequest",
  CertificateNameChangeRequestSchema,
);
