const Borrow = require("../models/borrow");

const Course = require("../models/course");

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

    const borrows = await Borrow.find({ userId })

      .populate({
        path: "courseId",

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
      if (!borrow.courseId) return;

      const item = {
        borrowId: borrow._id,

        course: borrow.courseId,

        borrowedAt: borrow.borrowedAt,

        expiresAt: borrow.expiresAt,

        progress: borrow.progress,

        status: borrow.status,
      };

      if (borrow.status === "active" && borrow.expiresAt > now) {
        item.remainingSeconds = Math.floor((borrow.expiresAt - now) / 1000);

        active.push(item);
      } else if (borrow.status === "active" && borrow.expiresAt <= now) {
        item.remainingSeconds = 0;

        expired.push(item);
      } else if (
        borrow.status === "returned" ||
        borrow.status === "completed"
      ) {
        item.returnedAt = borrow.returnedAt;

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

    borrow.returnedAt = new Date();

    await borrow.save();

    libraryCache.del(`library_${userId}`);

    return borrow;
  }

  static clearUserCache(userId) {
    libraryCache.del(`library_${userId}`);
  }
}

module.exports = LibraryService;
