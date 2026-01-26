const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/course");

exports.saveCourse = async (req, res) => {
  try {
    const courseId = req.params.id;
    const studentId = req.user && req.user._id;

    if (!studentId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Ensure course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const user = await User.findById(studentId);
    if (!user) return res.status(404).json({ error: "Student not found" });

    // Prevent duplicates
    const alreadySaved =
      user.savedCourses &&
      user.savedCourses.some((c) => c.toString() === courseId.toString());
    if (alreadySaved) {
      return res.status(400).json({ error: "Course already saved" });
    }

    user.savedCourses = user.savedCourses || [];
    user.savedCourses.push(courseId);
    await user.save();

    return res
      .status(201)
      .json({ message: "Course saved for later", savedCourseId: courseId });
  } catch (err) {
    console.error("saveCourse error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


exports.getSavedCourses = async (req, res) => {
  try {
    const studentId = req.params.id;

    // Allow only owner or admin
    if (!req.user)
      return res.status(401).json({ error: "Authentication required" });
    if (
      req.user.role !== "admin" &&
      req.user._id !== studentId &&
      req.user._id !== studentId.toString()
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const user = await User.findById(studentId).populate("savedCourses");
    if (!user) return res.status(404).json({ error: "Student not found" });

    return res.status(200).json({
      savedCourses: user.savedCourses || [],
    });
  } catch (err) {
    console.error("getSavedCourses error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


exports.deleteSavedCourse = async (req, res) => {
  try {
    const courseId = req.params.id;
    const studentId = req.user && req.user._id;

    if (!studentId)
      return res.status(401).json({ error: "Authentication required" });

    const user = await User.findById(studentId);
    if (!user) return res.status(404).json({ error: "Student not found" });

    const idx = (user.savedCourses || []).findIndex(
      (c) => c.toString() === courseId.toString(),
    );
    if (idx === -1) {
      return res.status(404).json({ error: "Saved course not found" });
    }

    user.savedCourses.splice(idx, 1);
    await user.save();

    return res.status(200).json({ message: "Saved course removed" });
  } catch (err) {
    console.error("deleteSavedCourse error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
