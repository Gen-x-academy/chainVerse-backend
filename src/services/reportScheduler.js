const cron = require("node-cron");
const CourseReport = require("../models/courseReport");
const Course = require("../models/course");
const { calculateMetrics } = require("../controllers/courseReportController");
const libraryAnalyticsService = require("./libraryAnalyticsService");

// Update all course reports every hour
const updateAllReports = async () => {
  try {
    const courses = await Course.find();
    for (const course of courses) {
      const metrics = await calculateMetrics(course._id);
      await CourseReport.findOneAndUpdate(
        { courseId: course._id },
        {
          ...metrics,
          lastUpdated: new Date(),
        },
        { upsert: true },
      );
    }
    console.log("Course reports updated successfully");
  } catch (error) {
    console.error("Error updating course reports:", error);
  }
};

// Update library analytics every hour
const updateLibraryAnalytics = async () => {
  try {
    await libraryAnalyticsService.aggregateStats("daily");
    await libraryAnalyticsService.aggregateStats("weekly");
    await libraryAnalyticsService.aggregateStats("monthly");
    console.log("Library analytics aggregated successfully");
  } catch (error) {
    console.error("Error aggregating library analytics:", error);
  }
};

// Initialize scheduler
const initScheduler = () => {
  // Run every hour
  cron.schedule("0 * * * *", () => {
    updateAllReports();
    updateLibraryAnalytics();
  });

  // Also run immediately on startup
  updateAllReports();
  updateLibraryAnalytics();
};

module.exports = {
  initScheduler,
};
