const express = require("express");
const router = express.Router();
const adminAccountController = require("../controllers/adminAccountController");

// Middleware
const auth = require("../middlewares/auth"); // Ensure this is the correct path to your auth middleware
const adminMiddleware = require("../middlewares/admin");
const { upload } = require("../middlewares/fileUpload");

// Validators
const {
  updateProfileSchema,
  changePasswordSchema,
} = require("../validators/adminAccountValidator");
const {
  createRateLimitMiddleware,
} = require("../middlewares/rateLimitMiddleware");

// Helper to wrap Joi validation as middleware
const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });
  next();
};

// Limit to 5 attempts per hour to prevent brute force
const passwordChangeLimiter = createRateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many password change attempts, please try again later.",
});

// @route   GET /admin/account
router.get(
  "/account",
  [auth.authenticate, adminMiddleware.ensureAdmin],
  adminAccountController.getAccountDetails,
);

// // @route   PUT /admin/account/update
router.put(
  "/account/update",
  [
    auth.authenticate,
    adminMiddleware.ensureAdmin,
    validate(updateProfileSchema),
  ],
  adminAccountController.updateProfile,
);

// // @route   PUT /admin/account/change-password
router.put(
  "/account/change-password",
  [
    auth.authenticate,
    adminMiddleware.ensureAdmin,
    passwordChangeLimiter,
    validate(changePasswordSchema),
  ],
  adminAccountController.changePassword,
);

// // @route   POST /admin/account/upload-profile-image
// // Assuming 'profileImage' is the key name for the file in form-data
router.post(
  "/account/upload-profile-image",
  [
    auth.authenticate,
    adminMiddleware.ensureAdmin,
    upload.single("profileImage"),
  ],
  adminAccountController.uploadProfileImage,
);

module.exports = router;
