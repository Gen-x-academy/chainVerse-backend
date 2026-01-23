const OrganizationMember = require('../models/OrganizationMember');
const User = require('../models/User');
const Organization = require('../models/organization');
const crypto = require('crypto');
const { sendMemberWelcomeEmail, sendMemberRemovalNotification } = require('../utils/organizationEmailService');
const { isValidEmail, validatePassword } = require('../utils/fieldValidation');

/**
 * Generate a secure random password
 * @returns {string} Generated password
 */
const generatePassword = () => {
  const length = 12;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + special;
  
  let password = '';
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Add new organization member
exports.addMember = async (req, res) => {
  try {
    const { email, fullName, role } = req.body;

    // Validate required fields
    if (!email || !fullName || !role) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, fullName, and role are required' 
      });
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email format' 
      });
    }

    // Validate role
    const validRoles = ['Admin', 'Employee', 'Student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: `Role must be one of: ${validRoles.join(', ')}` 
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists in the system
    let user = await User.findOne({ email: normalizedEmail });
    
    // Check if member already exists in this organization
    const existingMember = await OrganizationMember.findOne({
      organizationId: req.user.organizationId,
      email: normalizedEmail
    });

    if (existingMember) {
      return res.status(400).json({ 
        success: false,
        message: 'Member already exists in this organization' 
      });
    }

    // Generate secure password
    const generatedPassword = generatePassword();

    // Create or update user account
    if (!user) {
      // Create new user account
      user = new User({
        email: normalizedEmail,
        password: generatedPassword, // Will be hashed by User model pre-save hook
        fullName: fullName.trim(),
        isEmailVerified: false,
        role: 'student' // Default platform role
      });
      await user.save();
    } else {
      // User exists but not in this organization - update fullName if needed
      if (!user.fullName) {
        user.fullName = fullName.trim();
        await user.save();
      }
    }

    // Create organization member record
    const newMember = new OrganizationMember({
      organizationId: req.user.organizationId,
      userId: user._id,
      email: normalizedEmail,
      fullName: fullName.trim(),
      role,
      status: 'Active' // Set to Active since we're creating account immediately
    });

    await newMember.save();

    // Get organization name for the email
    const organization = await Organization.findById(req.user.organizationId);
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found' 
      });
    }

    // Send welcome email with login credentials
    try {
      await sendMemberWelcomeEmail(
        normalizedEmail, 
        fullName.trim(), 
        organization.name, 
        normalizedEmail, 
        generatedPassword
      );
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      // Don't fail the request if email fails, but log it
    }

    // Update organization member count
    await Organization.updateOne(
      { _id: req.user.organizationId },
      { $inc: { members: 1 } }
    );

    res.status(201).json({
      success: true,
      message: 'Member added successfully. Welcome email sent with login credentials.',
      data: {
        _id: newMember._id,
        email: newMember.email,
        fullName: newMember.fullName,
        role: newMember.role,
        status: newMember.status,
        createdAt: newMember.createdAt
      }
    });
  } catch (error) {
    console.error('Error adding member:', error);
    
    // Handle duplicate key error (unique email constraint)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'A member with this email already exists' 
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Get all organization members
exports.getAllMembers = async (req, res) => {
  try {
    const members = await OrganizationMember.find({
      organizationId: req.user.organizationId
    })
    .select('-invitationToken -invitationExpires')
    .populate('userId', 'email fullName profileImage')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Members retrieved successfully',
      data: members
    });
  } catch (error) {
    console.error('Error getting members:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Get single member details
exports.getMemberById = async (req, res) => {
  try {
    const member = await OrganizationMember.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
    .select('-invitationToken -invitationExpires')
    .populate('userId', 'email fullName profileImage phoneNumber position');

    if (!member) {
      return res.status(404).json({ 
        success: false,
        message: 'Member not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Member details retrieved successfully',
      data: member
    });
  } catch (error) {
    console.error('Error getting member:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Update member role
exports.updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;

    // Validate role
    if (!role) {
      return res.status(400).json({ 
        success: false,
        message: 'Role is required' 
      });
    }

    const validRoles = ['Admin', 'Employee', 'Student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: `Role must be one of: ${validRoles.join(', ')}` 
      });
    }

    const member = await OrganizationMember.findOneAndUpdate(
      {
        _id: req.params.id,
        organizationId: req.user.organizationId
      },
      { role },
      { new: true }
    )
    .select('-invitationToken -invitationExpires')
    .populate('userId', 'email fullName');

    if (!member) {
      return res.status(404).json({ 
        success: false,
        message: 'Member not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Member role updated successfully',
      data: member
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// Remove organization member
exports.removeMember = async (req, res) => {
  try {
    const member = await OrganizationMember.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!member) {
      return res.status(404).json({ 
        success: false,
        message: 'Member not found' 
      });
    }

    // Prevent removing yourself
    if (member.userId && member.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot remove yourself from the organization' 
      });
    }

    // Get organization name for the email
    const organization = await Organization.findById(req.user.organizationId);
    
    // Send removal notification
    try {
      await sendMemberRemovalNotification(member.email, member.fullName, organization.name);
    } catch (emailError) {
      console.error('Error sending removal notification:', emailError);
      // Don't fail the request if email fails
    }

    // Delete the member record
    await OrganizationMember.findByIdAndDelete(member._id);

    // Update organization member count
    await Organization.updateOne(
      { _id: req.user.organizationId },
      { $inc: { members: -1 } }
    );

    res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: {
        _id: member._id,
        email: member.email,
        fullName: member.fullName
      }
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};