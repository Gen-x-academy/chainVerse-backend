const express = require("express");
const router = express.Router();
const libraryAnalyticsController = require("../controllers/libraryAnalyticsController");
const authMiddleware = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");

// Dashboard stats (Protected - Admin/DAO only)
router.get(
  "/overview",
  authMiddleware,
  authorize("admin", "dao"),
  libraryAnalyticsController.getLibraryStats,
);

// Manually trigger aggregation (Admin only)
router.post(
  "/aggregate",
  authMiddleware,
  authorize("admin"),
  libraryAnalyticsController.triggerAggregation,
);

module.exports = router;
