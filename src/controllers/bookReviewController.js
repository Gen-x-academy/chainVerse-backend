const Review = require("../models/BookReview");
const Book = require("../models/book");

// Utility function for error handling
const handleError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

// Utility function for success response
const handleSuccess = (res, statusCode, message, data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// Helper function to update book ratings
const updateBookRatings = async (bookId) => {
  const reviews = await Review.find({ book: bookId, reported: false });

  if (reviews.length === 0) {
    await Book.findByIdAndUpdate(bookId, {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    return;
  }

  const totalReviews = reviews.length;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  const averageRating = Math.round((sum / totalReviews) * 10) / 10;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review) => {
    distribution[review.rating]++;
  });

  await Book.findByIdAndUpdate(bookId, {
    averageRating,
    totalReviews,
    ratingDistribution: distribution,
  });
};

// POST /books/:bookId/reviews - Create or update review
exports.createOrUpdateReview = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { rating, review } = req.body;
    const userId = req.user.id; // Assuming auth middleware sets req.user

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return handleError(res, 400, "Rating must be between 1 and 5");
    }

    if (review && review.length > 2000) {
      return handleError(
        res,
        400,
        "Review text must not exceed 2000 characters",
      );
    }

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return handleError(res, 404, "Book not found");
    }

    // Anti-abuse: Check if user has submitted too many reviews recently
    const recentReviews = await Review.countDocuments({
      user: userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (recentReviews >= 10) {
      return handleError(
        res,
        429,
        "Too many reviews submitted. Please try again later.",
      );
    }

    // Create or update review (upsert)
    const existingReview = await Review.findOne({ book: bookId, user: userId });

    let savedReview;
    if (existingReview) {
      existingReview.rating = rating;
      existingReview.review = review || existingReview.review;
      savedReview = await existingReview.save();
    } else {
      savedReview = await Review.create({
        book: bookId,
        user: userId,
        rating,
        review,
      });
    }

    // Update book aggregate ratings
    await updateBookRatings(bookId);

    return handleSuccess(
      res,
      existingReview ? 200 : 201,
      existingReview
        ? "Review updated successfully"
        : "Review created successfully",
      savedReview,
    );
  } catch (error) {
    console.error("Error creating/updating review:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return handleError(res, 409, "You have already reviewed this book");
    }

    return handleError(res, 500, "Internal server error");
  }
};

// GET /books/:bookId/reviews - Get all reviews for a book
exports.getBookReviews = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { page = 1, limit = 10, sort = "recent" } = req.query;

    // Check if book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return handleError(res, 404, "Book not found");
    }

    // Determine sort order
    let sortOption = { createdAt: -1 }; // Default: most recent
    if (sort === "helpful") {
      sortOption = { helpful: -1, createdAt: -1 };
    } else if (sort === "highest") {
      sortOption = { rating: -1, createdAt: -1 };
    } else if (sort === "lowest") {
      sortOption = { rating: 1, createdAt: -1 };
    }

    const reviews = await Review.find({ book: bookId, reported: false })
      .populate("user", "name email") // Adjust fields based on your User model
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sortOption);

    const total = await Review.countDocuments({
      book: bookId,
      reported: false,
    });

    return handleSuccess(res, 200, "Reviews retrieved successfully", {
      reviews,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalReviews: total,
      bookRating: {
        average: book.averageRating,
        total: book.totalReviews,
        distribution: book.ratingDistribution,
      },
    });
  } catch (error) {
    console.error("Error retrieving reviews:", error);
    return handleError(res, 500, "Internal server error");
  }
};

// GET /reviews/my-review/:bookId - Get current user's review for a book
exports.getMyReview = async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user.id;

    const review = await Review.findOne({
      book: bookId,
      user: userId,
    }).populate("book", "title author");

    if (!review) {
      return handleError(res, 404, "Review not found");
    }

    return handleSuccess(res, 200, "Review retrieved successfully", review);
  } catch (error) {
    console.error("Error retrieving review:", error);
    return handleError(res, 500, "Internal server error");
  }
};

// DELETE /reviews/:reviewId - Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    const review = await Review.findById(reviewId);

    if (!review) {
      return handleError(res, 404, "Review not found");
    }

    // Check if user owns the review (or is admin)
    if (review.user.toString() !== userId && !req.user.isAdmin) {
      return handleError(res, 403, "Not authorized to delete this review");
    }

    const bookId = review.book;
    await review.deleteOne();

    // Update book aggregate ratings
    await updateBookRatings(bookId);

    return handleSuccess(res, 200, "Review deleted successfully");
  } catch (error) {
    console.error("Error deleting review:", error);
    return handleError(res, 500, "Internal server error");
  }
};

// POST /reviews/:reviewId/helpful - Mark review as helpful
exports.markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { $inc: { helpful: 1 } },
      { new: true },
    );

    if (!review) {
      return handleError(res, 404, "Review not found");
    }

    return handleSuccess(res, 200, "Review marked as helpful", review);
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    return handleError(res, 500, "Internal server error");
  }
};

// POST /reviews/:reviewId/report - Report a review
exports.reportReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason } = req.body;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { reported: true },
      { new: true },
    );

    if (!review) {
      return handleError(res, 404, "Review not found");
    }

    // Update book ratings to exclude reported review
    await updateBookRatings(review.book);

    // TODO: Create a separate reporting system to track reasons and notify admins
    // For now, just flag the review

    return handleSuccess(res, 200, "Review reported successfully");
  } catch (error) {
    console.error("Error reporting review:", error);
    return handleError(res, 500, "Internal server error");
  }
};

module.exports = exports;
