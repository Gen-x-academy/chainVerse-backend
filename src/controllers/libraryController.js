const LibraryService = require("../services/libraryService");

const { updateBorrowProgress } = require("../utils/borrowHelper");

const logger = require("../utils/logger");

const handleError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,

    message,
  });
};

const handleSuccess = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,

    message,

    data,
  });
};

exports.getUserLibrary = async (req, res) => {
  try {
    const userId = req.user._id;

    const library = await LibraryService.getUserLibrary(userId);

    return handleSuccess(res, 200, "Library retrieved successfully", library);
  } catch (error) {
    logger.error(`Error retrieving user library: ${error.message}`);

    return handleError(res, 500, "Internal server error");
  }
};

exports.returnBorrow = async (req, res) => {
  try {
    const userId = req.user._id;

    const { borrowId } = req.params;

    const borrow = await LibraryService.returnBorrow(userId, borrowId);

    return handleSuccess(res, 200, "Course returned successfully", {
      borrowId: borrow._id,

      status: borrow.status,

      returnedAt: borrow.returnedAt,
    });
  } catch (error) {
    logger.error(`Error returning borrow: ${error.message}`);

    if (error.message === "Borrow not found") {
      return handleError(res, 404, error.message);
    }

    if (error.message === "Borrow is not active") {
      return handleError(res, 400, error.message);
    }

    return handleError(res, 500, "Internal server error");
  }
};

exports.updateProgress = async (req, res) => {
  try {
    const { borrowId } = req.params;

    const { progress } = req.body;

    if (progress === undefined || progress < 0 || progress > 100) {
      return handleError(res, 400, "Progress must be between 0 and 100");
    }

    const borrow = await updateBorrowProgress(borrowId, progress);

    return handleSuccess(res, 200, "Progress updated successfully", {
      borrowId: borrow._id,

      progress: borrow.progress,

      status: borrow.status,
    });
  } catch (error) {
    logger.error(`Error updating progress: ${error.message}`);

    if (error.message === "Borrow not found") {
      return handleError(res, 404, error.message);
    }

    return handleError(res, 500, "Internal server error");
  }
};
