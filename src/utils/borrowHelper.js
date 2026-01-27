const Borrow = require("../models/Borrow");
const LibraryService = require("../services/libraryService");

const createBorrow = async (userId, courseId, durationDays = 14) => {
  const borrowDate = new Date();
  const expiryDate = new Date(borrowDate);
  expiryDate.setDate(expiryDate.getDate() + durationDays);

  const borrow = await Borrow.create({
    userId,
    resourceId: courseId,
    resourceType: "course",
    resourceTitle: "Course",
    borrowDate,
    expiryDate,
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
    borrow.returnDate = new Date();
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
      expiryDate: { $lt: now },
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
