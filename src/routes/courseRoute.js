const express = require("express");
const router = express.Router();
const isAdmin = require("../middlewares/admin");
const auth = require("./../middlewares/auth");
const {
  publicRateLimitMiddleware,
} = require("../middlewares/rateLimitMiddleware");

const courseController = require("../controllers/courseController");
const adminCourseController = require("../controllers/courseController");
const { authMiddleware, roleMiddleware } = require("../middlewares/auth");
const { optionalAuth } = require("../middlewares/authMiddleware");
const {
  completeCourse,
  getCertificate,
} = require("../controllers/certificateController");
const { mintNft } = require("../controllers/nftController");

router.post(
  "/courses",
  auth.authenticate,
  isAdmin.ensureAdmin,
  courseController.createCourse,
);
router.post("/:id/complete", auth.authenticate, completeCourse);
router.get("/:id/certificate", auth.authenticate, getCertificate);
router.post("/:id/mint-nft", auth.authenticate, mintNft);
router.get(
  "/courses",
  optionalAuth,
  publicRateLimitMiddleware,
  courseController.getPublicCourses,
);
router.get(
  "/courses/:id",
  optionalAuth,
  publicRateLimitMiddleware,
  courseController.getPublicCourseById,
);

router.get(
  "/admin/courses",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.getAllCourses,
);
router.get(
  "/admin/course/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.getCourseById,
);
router.post(
  "/admin/course/review/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.reviewCourse,
);

router.patch(
  "/admin/course/publish/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.publishCourse,
);
router.patch(
  "/admin/course/unpublish/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.unpublishCourse,
);
router.delete(
  "/admin/course/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.deleteCourse,
);

router.patch(
  "/admin/course/update/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.updateCourse,
);
router.get(
  "/admin/course/enrollments/:id",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.getCourseEnrollments,
);

router.post(
  "/admin/course",
  auth.authenticate,
  auth.hasRole(["admin"]),
  adminCourseController.createCourse,
);

module.exports = router;
