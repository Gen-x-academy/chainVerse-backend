const Tutor = require("../models/tutors");

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

// Update tutor profile
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const tutorId = req.tutor.id;

    // Email update requires verification (simplified for now: just update and set verified to false)
    if (updates.email) {
      const existingTutor = await Tutor.findOne({ email: updates.email });
      if (existingTutor && existingTutor.id !== tutorId) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
      // If email changed, we might want to trigger verification
      // For now, let's keep it simple as per instructions
    }

    const tutor = await Tutor.findByIdAndUpdate(tutorId, updates, { new: true, runValidators: true }).select("-password");

    res.status(200).json({ success: true, message: "Profile updated successfully", tutor });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const tutor = await Tutor.findById(req.tutor.id).select("+password");

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
