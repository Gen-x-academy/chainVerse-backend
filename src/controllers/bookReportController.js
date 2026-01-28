const BookReport = require('../models/bookReport');
const Book = require('../models/book');
const { logAuditAction } = require('../utils/auditLogger');
const { sanitizeContent } = require('../utils/sanitizer');
const NodeCache = require('node-cache');

const reportCache = new NodeCache({ stdTTL: 300 }); // 5 minute cache

// Helper functions
const handleError = (res, error, message = 'An error occurred') => {
  console.error(`${message}:`, error);
  return res.status(500).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

const handleSuccess = (res, data, message, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * @desc    Submit a new book report
 * @route   POST /api/book-reports
 * @access  Private (authenticated users)
 */
const submitReport = async (req, res) => {
  try {
    const { bookId, reason, description } = req.body;
    const reporterId = req.user._id;

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    // Check for existing report from same user for same book
    const existingReport = await BookReport.findOne({
      book: bookId,
      reporter: reporterId
    });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted a report for this book'
      });
    }

    // Sanitize description
    const sanitizedDescription = sanitizeContent(description);

    // Determine priority based on reason
    let priority = 'medium';
    if (reason === 'offensive') priority = 'high';
    if (reason === 'copyright') priority = 'critical';

    const report = new BookReport({
      book: bookId,
      reporter: reporterId,
      reason,
      description: sanitizedDescription,
      priority
    });

    await report.save();

    // Update book report status if this is first report
    const reportCount = await BookReport.countDocuments({ book: bookId, status: 'pending' });
    if (reportCount >= 3) {
      await Book.findByIdAndUpdate(bookId, { reportStatus: 'under_review' });
    }

    // Clear cache
    reportCache.flushAll();

    // Audit log
    await logAuditAction({
      action: 'BOOK_REPORT_SUBMITTED',
      userId: reporterId,
      targetId: bookId,
      targetType: 'Book',
      details: { reason, reportId: report._id }
    });

    return handleSuccess(res, { reportId: report._id }, 'Report submitted successfully', 201);
  } catch (error) {
    return handleError(res, error, 'Failed to submit report');
  }
};

/**
 * @desc    Get user's own reports
 * @route   GET /api/book-reports/my-reports
 * @access  Private (authenticated users)
 */
const getMyReports = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const reporterId = req.user._id;

    const query = { reporter: reporterId };
    if (status) query.status = status;

    const reports = await BookReport.find(query)
      .populate('book', 'title author coverImage')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BookReport.countDocuments(query);

    return handleSuccess(res, {
      reports,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    }, 'Reports retrieved successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to retrieve reports');
  }
};

/**
 * @desc    Get all reports (admin)
 * @route   GET /api/book-reports/admin
 * @access  Private (admin/staff)
 */
const getAllReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      reason,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Check cache
    const cacheKey = `reports_${page}_${limit}_${status}_${priority}_${reason}_${sortBy}_${sortOrder}`;
    const cachedData = reportCache.get(cacheKey);
    if (cachedData) {
      return handleSuccess(res, cachedData, 'Reports retrieved from cache');
    }

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (reason) query.reason = reason;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const reports = await BookReport.find(query)
      .populate('book', 'title author coverImage reportStatus')
      .populate('reporter', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BookReport.countDocuments(query);

    const responseData = {
      reports,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    };

    // Cache the response
    reportCache.set(cacheKey, responseData);

    return handleSuccess(res, responseData, 'Reports retrieved successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to retrieve reports');
  }
};

/**
 * @desc    Get single report details (admin)
 * @route   GET /api/book-reports/admin/:reportId
 * @access  Private (admin/staff)
 */
const getReportById = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await BookReport.findById(reportId)
      .populate('book', 'title author coverImage description reportStatus')
      .populate('reporter', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Get related reports for same book
    const relatedReports = await BookReport.find({
      book: report.book._id,
      _id: { $ne: reportId }
    })
      .populate('reporter', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    return handleSuccess(res, { report, relatedReports }, 'Report retrieved successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to retrieve report');
  }
};

/**
 * @desc    Review/update report status (admin)
 * @route   PATCH /api/book-reports/admin/:reportId/review
 * @access  Private (admin/staff)
 */
const reviewReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes, resolution, updateBookStatus } = req.body;
    const adminId = req.user._id;

    const report = await BookReport.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Update report
    report.status = status || report.status;
    report.adminNotes = adminNotes ? sanitizeContent(adminNotes) : report.adminNotes;
    report.resolution = resolution || report.resolution;
    report.reviewedBy = adminId;

    await report.save();

    // Update book status if requested
    if (updateBookStatus) {
      const newBookStatus = updateBookStatus === 'remove' ? 'removed' : 
                           updateBookStatus === 'restore' ? 'active' : 'under_review';
      await Book.findByIdAndUpdate(report.book, { reportStatus: newBookStatus });
    }

    // Clear cache
    reportCache.flushAll();

    // Audit log
    await logAuditAction({
      action: 'BOOK_REPORT_REVIEWED',
      userId: adminId,
      targetId: reportId,
      targetType: 'BookReport',
      details: { status, resolution, updateBookStatus }
    });

    return handleSuccess(res, { report }, 'Report reviewed successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to review report');
  }
};

/**
 * @desc    Bulk update report statuses (admin)
 * @route   PATCH /api/book-reports/admin/bulk-update
 * @access  Private (admin/staff)
 */
const bulkUpdateReports = async (req, res) => {
  try {
    const { reportIds, status, adminNotes } = req.body;
    const adminId = req.user._id;

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Report IDs are required'
      });
    }

    const updateData = {
      status,
      reviewedBy: adminId,
      reviewedAt: new Date()
    };
    if (adminNotes) updateData.adminNotes = sanitizeContent(adminNotes);

    const result = await BookReport.updateMany(
      { _id: { $in: reportIds } },
      { $set: updateData }
    );

    // Clear cache
    reportCache.flushAll();

    // Audit log
    await logAuditAction({
      action: 'BOOK_REPORTS_BULK_UPDATED',
      userId: adminId,
      targetId: null,
      targetType: 'BookReport',
      details: { reportIds, status, count: result.modifiedCount }
    });

    return handleSuccess(res, {
      modifiedCount: result.modifiedCount
    }, `${result.modifiedCount} reports updated successfully`);
  } catch (error) {
    return handleError(res, error, 'Failed to bulk update reports');
  }
};

/**
 * @desc    Get report statistics (admin)
 * @route   GET /api/book-reports/admin/stats
 * @access  Private (admin/staff)
 */
const getReportStats = async (req, res) => {
  try {
    // Check cache
    const cacheKey = 'report_stats';
    const cachedData = reportCache.get(cacheKey);
    if (cachedData) {
      return handleSuccess(res, cachedData, 'Stats retrieved from cache');
    }

    const [
      totalReports,
      pendingReports,
      underReviewReports,
      resolvedReports,
      dismissedReports,
      byReason,
      byPriority,
      recentReports
    ] = await Promise.all([
      BookReport.countDocuments(),
      BookReport.countDocuments({ status: 'pending' }),
      BookReport.countDocuments({ status: 'under_review' }),
      BookReport.countDocuments({ status: 'resolved' }),
      BookReport.countDocuments({ status: 'dismissed' }),
      BookReport.aggregate([
        { $group: { _id: '$reason', count: { $sum: 1 } } }
      ]),
      BookReport.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      BookReport.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('book', 'title')
        .populate('reporter', 'firstName lastName')
    ]);

    // Get most reported books
    const mostReportedBooks = await BookReport.aggregate([
      { $group: { _id: '$book', reportCount: { $sum: 1 } } },
      { $sort: { reportCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'books',
          localField: '_id',
          foreignField: '_id',
          as: 'bookDetails'
        }
      },
      { $unwind: '$bookDetails' },
      {
        $project: {
          bookId: '$_id',
          title: '$bookDetails.title',
          reportCount: 1
        }
      }
    ]);

    const stats = {
      overview: {
        total: totalReports,
        pending: pendingReports,
        underReview: underReviewReports,
        resolved: resolvedReports,
        dismissed: dismissedReports
      },
      byReason: byReason.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      mostReportedBooks,
      recentReports
    };

    // Cache the stats
    reportCache.set(cacheKey, stats);

    return handleSuccess(res, stats, 'Stats retrieved successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to retrieve stats');
  }
};

/**
 * @desc    Delete a report (admin)
 * @route   DELETE /api/book-reports/admin/:reportId
 * @access  Private (admin only)
 */
const deleteReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const adminId = req.user._id;

    const report = await BookReport.findByIdAndDelete(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Clear cache
    reportCache.flushAll();

    // Audit log
    await logAuditAction({
      action: 'BOOK_REPORT_DELETED',
      userId: adminId,
      targetId: reportId,
      targetType: 'BookReport',
      details: { bookId: report.book, reason: report.reason }
    });

    return handleSuccess(res, null, 'Report deleted successfully');
  } catch (error) {
    return handleError(res, error, 'Failed to delete report');
  }
};

module.exports = {
  submitReport,
  getMyReports,
  getAllReports,
  getReportById,
  reviewReport,
  bulkUpdateReports,
  getReportStats,
  deleteReport
};
