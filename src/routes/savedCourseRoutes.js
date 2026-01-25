const express = require("express");
const router = express.Router();

const {
  authMiddleware,
  roleMiddleware,
} = require("../middlewares/authMiddleware");
const savedCourseController = require("../controllers/savedCourseController");
const validateObjectId = require("../middlewares/validateObjectId");

router.post(
  "/student/save/:id/add",
  authMiddleware,
  roleMiddleware("student"),
  validateObjectId,
  savedCourseController.saveCourse,
);

router.get(
  "/student/save/:id",
  authMiddleware,
  validateObjectId,
  savedCourseController.getSavedCourses,
);

router.delete(
  "/student/save/:id",
  authMiddleware,
  roleMiddleware("student"),
  validateObjectId,
  savedCourseController.deleteSavedCourse,
);

module.exports = router;
