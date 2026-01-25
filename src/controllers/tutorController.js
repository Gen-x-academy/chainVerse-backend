const Tutor = require("../models/tutors");
// const { doHmac } = require("../utils/hashing");
// const { sendEmail } = require("../utils/sendMail");
const {
  isValidEmail,
  isValidPhoneNumber,
  validatePassword,
  triggerEmailVerification,
} = require('../utils/fieldValidation');

// Get all tutors with pagination
exports.getAllTutors = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const tutors = await Tutor.find()
      .select(
        "id firstName lastName bio rating numberOfCourses numberOfStudents primaryExpertise"
      )
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json(tutors);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Get tutor by ID
exports.getTutorById = async (req, res) => {
  try {
    const tutor = await Tutor.findById(req.params.id);
    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }
    res.status(200).json(tutor);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Get current tutor profile
exports.getProfile = async (req, res) => {
  try {
    const tutor = await Tutor.findById(req.tutor.id).select("-password -refreshToken");
    if (!tutor) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }
    res.status(200).json({ success: true, tutor });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


/**
 * @desc    Update tutor profile details
 * @route   PUT /tutor/profile/update
 * @access  Private
 * @param   {object} req.body - fullName, email, phoneNumber, position
 */
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, experience, bio, web3Expertise } = req.body;
    const updateFields = {};

    // Build update object with validated fields
    if (fullName) updateFields.fullName = fullName;
    if (experience) updateFields.experience = experience;
    if (web3Expertise) updateFields.web3Expertise = web3Expertise;
    if (bio) updateFields.bio = bio;

    // Validating email if provided
    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }

      // Checking if email is already in use by another user
      const existingTutorWithEmail = await Tutor.findOne({
        email,
        _id: { $ne: req.tutor._id },
      });
      if (existingTutorWithEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use',
        });
      }

      // Setting isEmailVerified to false if email is updated
      if (email !== req.tutor.email) {
        updateFields.email = email;
        updateFields.isEmailVerified = false;
      }
    }

    if (phoneNumber) {
      if (!isValidPhoneNumber(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number format',
        });
      }
      updateFields.phoneNumber = phoneNumber;
    }

    // Update user profile
    const updatedTutor = await Tutor.findByIdAndUpdate(
      req.tutor._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    // Trigger email verification if email was changed
    if (updateFields.email) {
      verificationLink = `${process.env.BASE_URL}/organization/profile/verify-email/${req.tutor._id}`;
      let message = `Click the link below to verify your email <br /> <a href="${verificationLink}">Verify Email</a>`;
      // await sendEmail(
      //   updateFields.email,
      //   req.user._id,
      //   'ChainVerse: Email Update Verification',
      //   message
      // );
      triggerEmailVerification(updateFields.email, req.tutor._id);
    }

    // res.status(200).json({
    //   success: true,
    //   data: updatedTutor,
    //   message: updateFields.email
    //     ? `Profile updated successfully. Please check your email inbox, and verify your email`
    //     : 'Profile updated successfully',
    // });
    res.status(200).json({ success: true, message: updateFields.email && updateFields.email !== req.tutor.email ? "Profile updated, please verify your new email" : "Profile updated successfully", tutor: updatedTutor });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const tutor = await Tutor.findById(req.tutor.id).select("+password");

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ success: false, message: "Invalid password format" });
    }

    const isMatch = await tutor.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect current password" });
    }

    tutor.password = newPassword;
    await tutor.save();

    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Upload profile image
const { uploadToCloudStorage } = require("../utils/cloudStorage");
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.files || !req.files.profileImage) {
      return res.status(400).json({ success: false, message: "No image file uploaded" });
    }

    const file = req.files.profileImage;
    const key = `tutors/${req.tutor.id}/profile-image-${Date.now()}`;
    const uploadResult = await uploadToCloudStorage(key, file.data);

    await Tutor.findByIdAndUpdate(req.tutor.id, { profileImage: uploadResult.url });

    res.status(200).json({ success: true, message: "Profile image uploaded successfully", imageUrl: uploadResult.url });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
