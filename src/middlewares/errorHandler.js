/**
 * @desc    Handle Multer errors
 * @param   {Error} err - Error object
 * @param   {object} req - Request object
 * @param   {object} res - Response object
 * @param   {function} next - Next middleware
 */
const handleMulterErrors = (err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File size cannot exceed 2MB",
    });
  }

  if (
    err.message.includes("Only .jpeg, .jpg, .png and .webp files are allowed")
  ) {
    return res.status(400).json({
      success: false,
      message: "Only .jpeg, .jpg, .png and .webp files are allowed",
    });
  }

  // For other Multer errors
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // Pass to next error handler
  next(err);
};

/**
 * @desc    Async handler wrapper to catch async errors
 * @param   {function} fn - Async function to wrap
 * @returns {function} Wrapped function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { handleMulterErrors, asyncHandler };
