const Borrow = require("../models/Borrow");
const NodeCache = require("node-cache");

const libraryCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class LibraryService {
  static async getUserLibrary(userId) {
    const cacheKey = `library_${userId}`;
    const cached = libraryCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const now = new Date();

    const borrows = await Borrow.find({
      userId,
      resourceType: "course",
    })
      .populate({
        path: "resourceId",
        select: "title description thumbnail tutor duration level",
        populate: {
          path: "tutor",
          select: "fullName email",
        },
      })
      .lean();

    const active = [];
    const expired = [];
    const history = [];

    borrows.forEach((borrow) => {
      if (!borrow.resourceId) return;

      const item = {
        borrowId: borrow._id,
        course: borrow.resourceId,
        borrowedAt: borrow.borrowDate,
        expiresAt: borrow.expiryDate,
        progress: borrow.progress || 0,
        status: borrow.status,
      };

      if (borrow.status === "active" && borrow.expiryDate > now) {
        item.remainingSeconds = Math.floor((borrow.expiryDate - now) / 1000);
        active.push(item);
      } else if (
        (borrow.status === "active" || borrow.status === "expired") &&
        borrow.expiryDate <= now
      ) {
        item.remainingSeconds = 0;
        expired.push(item);
      } else if (
        borrow.status === "returned" ||
        borrow.status === "completed"
      ) {
        item.returnedAt = borrow.returnDate;
        history.push(item);
      }
    });

    const result = { active, expired, history };
    libraryCache.set(cacheKey, result);

    return result;
  }

  static async returnBorrow(userId, borrowId) {
    const borrow = await Borrow.findOne({ _id: borrowId, userId });

    if (!borrow) {
      throw new Error("Borrow not found");
    }

    if (borrow.status !== "active") {
      throw new Error("Borrow is not active");
    }

    borrow.status = "returned";
    borrow.returnDate = new Date();
    await borrow.save();

    libraryCache.del(`library_${userId}`);

    return borrow;
  }

  static clearUserCache(userId) {
    libraryCache.del(`library_${userId}`);
  }
}

module.exports = LibraryService;
