const Borrow = require("../models/Borrow");
const notificationService = require("../utils/notificationService");
const mongoose = require("mongoose");

class BorrowController {
  /**
   * Create a new borrow (checkout resource)
   */
  async createBorrow(req, res) {
    try {
      const {
        resourceId,
        resourceType,
        resourceTitle,
        borrowDurationDays = 14,
      } = req.body;
      const userId = req.user._id;

      // Check if user already has active borrow for this resource
      const existingBorrow = await Borrow.findOne({
        userId,
        resourceId,
        status: "active",
      });

      if (existingBorrow) {
        return res.status(400).json({
          success: false,
          message: "You already have an active borrow for this resource",
        });
      }

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + borrowDurationDays);

      // Create borrow record
      const borrow = await Borrow.create({
        userId,
        resourceId,
        resourceType,
        resourceTitle,
        expiryDate,
        status: "active",
      });

      // Send success notification
      await notificationService.notifyBorrowSuccess({
        userId,
        resourceTitle,
        resourceId,
        expiryDate,
      });

      res.status(201).json({
        success: true,
        message: "Resource borrowed successfully",
        data: borrow,
      });
    } catch (error) {
      console.error("Create borrow error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to borrow resource",
      });
    }
  }

  /**
   * Get user's active borrows
   */
  async getUserBorrows(req, res) {
    try {
      const userId = req.user._id;
      const { status = "active", page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const [borrows, total] = await Promise.all([
        Borrow.find(query)
          .sort({ borrowDate: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Borrow.countDocuments(query),
      ]);

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: borrows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Get user borrows error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve borrows",
      });
    }
  }

  /**
   * Return a borrowed resource
   */
  async returnBorrow(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const borrow = await Borrow.findOneAndUpdate(
        { _id: id, userId, status: "active" },
        {
          status: "returned",
          returnDate: new Date(),
        },
        { new: true },
      );

      if (!borrow) {
        return res.status(404).json({
          success: false,
          message: "Active borrow not found",
        });
      }

      // Send notification
      await notificationService.createNotification({
        userId,
        title: "✅ Resource Returned",
        message: `You have successfully returned "${borrow.resourceTitle}".`,
        type: "success",
        metadata: {
          resourceId: borrow.resourceId,
          resourceTitle: borrow.resourceTitle,
          eventType: "borrow_returned",
        },
        sendEmail: false,
        sendWebSocket: true,
      });

      res.json({
        success: true,
        message: "Resource returned successfully",
        data: borrow,
      });
    } catch (error) {
      console.error("Return borrow error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to return resource",
      });
    }
  }

  /**
   * Renew a borrow (extend expiry date)
   */
  async renewBorrow(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const { extensionDays = 7 } = req.body;

      const borrow = await Borrow.findOne({
        _id: id,
        userId,
        status: "active",
      });

      if (!borrow) {
        return res.status(404).json({
          success: false,
          message: "Active borrow not found",
        });
      }

      // Extend expiry date
      const newExpiryDate = new Date(borrow.expiryDate);
      newExpiryDate.setDate(newExpiryDate.getDate() + extensionDays);

      borrow.expiryDate = newExpiryDate;
      borrow.reminderSent = false; // Reset reminder flag
      await borrow.save();

      // Send notification
      await notificationService.createNotification({
        userId,
        title: "🔄 Borrow Renewed",
        message: `Your borrow for "${borrow.resourceTitle}" has been extended until ${newExpiryDate.toLocaleDateString()}.`,
        type: "success",
        metadata: {
          resourceId: borrow.resourceId,
          resourceTitle: borrow.resourceTitle,
          newExpiryDate,
          eventType: "borrow_renewed",
        },
        sendEmail: true,
        sendWebSocket: true,
      });

      res.json({
        success: true,
        message: "Borrow renewed successfully",
        data: borrow,
      });
    } catch (error) {
      console.error("Renew borrow error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to renew borrow",
      });
    }
  }

  /**
   * Get borrow statistics
   */
  async getBorrowStats(req, res) {
    try {
      const userId = req.user._id;

      const stats = await Borrow.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      const statsMap = {
        active: 0,
        returned: 0,
        expired: 0,
        overdue: 0,
      };

      stats.forEach((stat) => {
        statsMap[stat._id] = stat.count;
      });

      res.json({
        success: true,
        data: statsMap,
      });
    } catch (error) {
      console.error("Get borrow stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve statistics",
      });
    }
  }
}

module.exports = new BorrowController();
