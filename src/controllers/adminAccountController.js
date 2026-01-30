const User = require("../models/User");

/**
 * @desc    Get current admin profile
 * @route   GET /admin/account
 * @access  Private (Admin)
 */
exports.getAccountDetails = async (req, res) => {
  try {
    // req.user is set by auth middleware
    const user = await User.findById(req.user._id).select(
      "-password -twoFASecret",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching admin account:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Update admin profile
 * @route   PUT /admin/account/update
 * @access  Private (Admin)
 */
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, email, phoneNumber } = req.body;
    const userId = req.user._id;

    // 1. Check if email is being changed and if it is unique
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser && existingUser._id.toString() !== userId.toString()) {
        return res.status(400).json({ message: "Email is already in use." });
      }
    }

    // 2. Update User
    // We use findByIdAndUpdate here because we are NOT changing the password
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fullName, email, phoneNumber },
      { new: true, runValidators: true },
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Change Password
 * @route   PUT /admin/account/change-password
 * @access  Private (Admin)
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // 1. Get user explicitly selecting the password field (if select: false in schema)
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Check current password using the Model Method
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // 3. Assign new password and Save
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc    Upload Profile Image
 * @route   POST /admin/account/upload-profile-image
 * @access  Private (Admin)
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const imageUrl = req.file.path || req.file.location;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profileImage: imageUrl },
      { new: true },
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      data: { profileImage: user.profileImage },
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
