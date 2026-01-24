const Borrow = require("../models/borrow");

const LibraryService = require("../services/libraryService");

const createBorrow = async (userId, courseId, durationDays = 14) => {
  const borrowedAt = new Date();

  const expiresAt = new Date(borrowedAt);

  expiresAt.setDate(expiresAt.getDate() + durationDays);

  const borrow = await Borrow.create({
    userId,

    courseId,

    borrowedAt,

    expiresAt,

    status: "active",

    progress: 0,
  });

  LibraryService.clearUserCache(userId);

  return borrow;
};

const updateBorrowProgress = async (borrowId, progress) => {
  const borrow = await Borrow.findById(borrowId);

  if (!borrow) {
    throw new Error("Borrow not found");
  }

  borrow.progress = Math.min(100, Math.max(0, progress));

  if (borrow.progress === 100) {
    borrow.status = "completed";

    borrow.returnedAt = new Date();
  }

  await borrow.save();

  LibraryService.clearUserCache(borrow.userId);

  return borrow;
};

const updateExpiredBorrows = async () => {
  const now = new Date();

  const result = await Borrow.updateMany(
    {
      status: "active",

      expiresAt: { $lt: now },
    },

    {
      $set: { status: "expired" },
    },
  );

  return result.modifiedCount;
};

module.exports = {
  createBorrow,

  updateBorrowProgress,

  updateExpiredBorrows,
};
