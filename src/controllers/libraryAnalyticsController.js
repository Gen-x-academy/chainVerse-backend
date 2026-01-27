const libraryAnalyticsService = require("../services/libraryAnalyticsService");
const LibraryAnalytics = require("../models/LibraryAnalytics");

const getLibraryStats = async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    // Get the latest aggregated stats for the period
    const stats = await LibraryAnalytics.findOne({ period }).sort({ date: -1 });

    if (!stats) {
      // If no stats found, trigger a manual aggregation for today
      const newStats = await libraryAnalyticsService.aggregateStats(period);
      return res.status(200).json({
        status: "success",
        data: newStats,
      });
    }

    res.status(200).json({
      status: "success",
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const triggerAggregation = async (req, res) => {
  try {
    const { period = "daily" } = req.body;
    const stats = await libraryAnalyticsService.aggregateStats(period);

    res.status(200).json({
      status: "success",
      message: `${period} aggregation completed`,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  getLibraryStats,
  triggerAggregation,
};
