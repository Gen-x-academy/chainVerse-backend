const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const adminMiddleware = require("../middlewares/admin");
const { validatePlatformInfo } = require("../validators/platformInfoValidator");
const platformInfoController = require("../controllers/platformInfoController");
const isAdmin = require("../middlewares/admin");
const certificateNameChangeController = require("../controllers/certificateNameChangeController");
// @route   POST /admin/platform-info
// @desc    Create platform information
// @access  Admin
router.post(
  "/platform-info",
  [auth.authenticate, isAdmin.ensureAdmin, validatePlatformInfo],
  platformInfoController.createPlatformInfo,
);

// @route   PUT /admin/platform-info/:id
// @desc    Update platform information
// @access  Admin
router.put(
  "/platform-info/:id",
  [auth.authenticate, isAdmin.ensureAdmin, validatePlatformInfo],
  platformInfoController.updatePlatformInfo,
);

// @route   DELETE /admin/platform-info/:id
// @desc    Delete platform information
// @access  Admin
router.delete(
  "/platform-info/:id",
  [auth.authenticate, isAdmin.ensureAdmin],
  platformInfoController.deletePlatformInfo,
);

// @route   GET /admin/certificates/name-change/requests
// @desc    Get all certificate name change requests
// @access  Admin
router.get(
  "/certificates/name-change/requests",
  [auth.authenticate, isAdmin.ensureAdmin],
  certificateNameChangeController.getAllRequests,
);

// @route   GET /admin/certificates/name-change/requests/:requestId
// @desc    Get a single certificate name change request
// @access  Admin
router.get(
  "/certificates/name-change/requests/:requestId",
  [auth.authenticate, isAdmin.ensureAdmin],
  certificateNameChangeController.getRequestById,
);

// @route   POST /admin/certificates/name-change/requests/:requestId/decision
// @desc    Make a decision on a certificate name change request
// @access  Admin
router.post(
  "/certificates/name-change/requests/:requestId/decision",
  [auth.authenticate, isAdmin.ensureAdmin],
  certificateNameChangeController.makeDecision,
);

module.exports = router;
