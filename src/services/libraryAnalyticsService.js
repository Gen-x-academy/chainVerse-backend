const LibraryEvent = require("../models/LibraryEvent");
const LibraryAnalytics = require("../models/LibraryAnalytics");
const Borrow = require("../models/Borrow");
const Book = require("../models/book");
const Course = require("../models/course");
const Enrollment = require("../models/enrollment");
const mongoose = require("mongoose");

class LibraryAnalyticsService {
  /**
   * Records a library-related event.
   */
  async trackEvent({
    userId,
    action,
    resourceId,
    resourceType = "book",
    value,
    metadata = {},
  }) {
    try {
      // Auto-detect course linkage if resource is a book and no courseId provided
      if (resourceType === "book" && !metadata.courseId) {
        const linkedCourseId = await this.findLinkedCourse(userId, resourceId);
        if (linkedCourseId) {
          metadata.courseId = linkedCourseId;
        }
      }

      const event = new LibraryEvent({
        userId,
        action,
        resourceId,
        resourceType,
        value,
        metadata,
      });
      await event.save();
      return event;
    } catch (error) {
      console.error("Error tracking library event:", error);
    }
  }

  /**
   * Finds if a book is recommended in any of the user's enrolled courses.
   */
  async findLinkedCourse(userId, bookId) {
    try {
      // Find courses where this book is recommended
      const coursesWithBook = await Course.find({
        "recommendedBooks.book": bookId,
      }).select("_id");

      if (coursesWithBook.length === 0) return null;

      const courseIds = coursesWithBook.map((c) => c._id);

      // Check if user is enrolled in any of these courses
      const enrollment = await Enrollment.findOne({
        studentId: userId,
        courseId: { $in: courseIds },
      });

      return enrollment ? enrollment.courseId : null;
    } catch (error) {
      console.error("Error finding linked course:", error);
      return null;
    }
  }

  /**
   * Aggregates stats for a given period (daily, weekly, monthly).
   */
  async aggregateStats(period = "daily", date = new Date()) {
    const startOfPeriod = this._getStartOfPeriod(period, date);
    const endOfPeriod = this._getEndOfPeriod(period, date);

    // Total Borrows in period
    const totalBorrows = await LibraryEvent.countDocuments({
      action: "BORROW",
      createdAt: { $gte: startOfPeriod, $lte: endOfPeriod },
    });

    // Active Readers
    const activeReaders = (
      await LibraryEvent.distinct("userId", {
        createdAt: { $gte: startOfPeriod, $lte: endOfPeriod },
      })
    ).length;

    // Most Borrowed Books
    const mostBorrowed = await LibraryEvent.aggregate([
      {
        $match: {
          action: "BORROW",
          resourceType: "book",
          createdAt: { $gte: startOfPeriod, $lte: endOfPeriod },
        },
      },
      { $group: { _id: "$resourceId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "books",
          localField: "_id",
          foreignField: "_id",
          as: "bookInfo",
        },
      },
      { $unwind: "$bookInfo" },
      {
        $project: {
          bookId: "$_id",
          title: "$bookInfo.title",
          count: 1,
        },
      },
    ]);

    // Completion Rates
    const completions = await LibraryEvent.countDocuments({
      action: { $in: ["COMPLETE", "PROGRESS_UPDATE"] },
      value: 100,
      createdAt: { $gte: startOfPeriod, $lte: endOfPeriod },
    });

    // Course Linked Engagement
    // Find borrows that have a courseId in metadata
    const courseEngagement = await LibraryEvent.aggregate([
      {
        $match: {
          action: "BORROW",
          "metadata.courseId": { $exists: true },
          createdAt: { $gte: startOfPeriod, $lte: endOfPeriod },
        },
      },
      { $group: { _id: "$metadata.courseId", borrowCount: { $sum: 1 } } },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      { $unwind: "$courseInfo" },
      {
        $project: {
          courseId: "$_id",
          courseTitle: "$courseInfo.title",
          borrowCount: 1,
        },
      },
    ]);

    // Update or Create the analytics record
    const analytics = await LibraryAnalytics.findOneAndUpdate(
      { period, date: startOfPeriod },
      {
        metrics: {
          totalBorrows,
          activeReaders,
          mostBorrowedBooks: mostBorrowed,
          completionRates: {
            completedCount: completions,
          },
          courseLinkedEngagement: courseEngagement,
        },
      },
      { upsert: true, new: true },
    );

    return analytics;
  }

  _getStartOfPeriod(period, date) {
    const d = new Date(date);
    if (period === "daily") {
      d.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  _getEndOfPeriod(period, date) {
    const d = this._getStartOfPeriod(period, date);
    if (period === "daily") {
      d.setDate(d.getDate() + 1);
    } else if (period === "weekly") {
      d.setDate(d.getDate() + 7);
    } else if (period === "monthly") {
      d.setMonth(d.getMonth() + 1);
    }
    d.setMilliseconds(d.getMilliseconds() - 1);
    return d;
  }
}

module.exports = new LibraryAnalyticsService();
