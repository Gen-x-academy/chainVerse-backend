const mongoose = require('mongoose');

const OrganizationMemberSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Optional initially, will be set when user account is created
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: ['Admin', 'Employee', 'Student'],
    default: 'Employee'
  },
  status: {
    type: String,
    enum: ['Pending', 'Active', 'Inactive'],
    default: 'Pending'
  },
  invitationToken: {
    type: String
  },
  invitationExpires: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
OrganizationMemberSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create unique index on email + organizationId to prevent duplicate members
OrganizationMemberSchema.index({ email: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model('OrganizationMember', OrganizationMemberSchema);