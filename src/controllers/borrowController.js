console.log("=== BORROW CONTROLLER STARTING ===");

const Borrow = require("../models/Borrow");
const notificationService = require("../utils/notificationService");
const mongoose = require("mongoose");

console.log("Dependencies loaded");

// Create a simple controller object with all methods
const borrowController = {
  // ===== NEW BOOK-SPECIFIC METHODS =====
  
  borrowBook: async function(req, res) {
    console.log("borrowBook method called");
    try {
      const { bookId } = req.params;
      const { borrowDurationDays = 14 } = req.body;
      const userId = req.user._id;

      // Validate book exists
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({
          success: false,
          message: "Book not found",
        });
      }

      if (!book.isActive) {
        return res.status(400).json({
          success: false,
          message: "This book is currently unavailable",
        });
      }

      // Check if user already has active borrow for THIS book (prevents re-borrow)
      const existingBorrow = await Borrow.findOne({
        userId,
        resourceId: bookId,
        resourceType: "book",
        status: "active",
      });

      if (existingBorrow) {
        return res.status(400).json({
          success: false,
          message: "You already have an active borrow for this book",
          data: {
            expiryDate: existingBorrow.expiryDate,
            daysRemaining: Math.ceil(
              (existingBorrow.expiryDate - new Date()) / (1000 * 60 * 60 * 24)
            ),
          },
        });
      }

      // Check availability (soft-lock mechanism)
      if (book.availableCopies <= 0) {
        return res.status(400).json({
          success: false,
          message: "No copies available at the moment. Please try again later.",
        });
      }

      // Calculate expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + borrowDurationDays);

      // Use transaction for atomicity
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Create borrow record
        const [borrow] = await Borrow.create([{
          userId,
          resourceId: bookId,
          resourceType: "book",
          resourceTitle: book.title,
          borrowDate: new Date(),
          expiryDate,
          status: "active",
          metadata: {
            author: book.author,
            isbn: book.isbn,
            borrowDurationDays,
          },
        }], { session });

        // Decrease available copies (soft-lock)
        book.availableCopies -= 1;
        await book.save({ session });

        await session.commitTransaction();
        console.log("Book borrowed:", borrow._id);

        // Send notification
        if (notificationService?.createNotification) {
          try {
            await notificationService.createNotification({
              userId,
              title: "📚 Book Borrowed Successfully",
              message: `You have borrowed "${book.title}". Due back on ${expiryDate.toLocaleDateString()}.`,
              type: "success",
              metadata: {
                resourceId: bookId,
                resourceTitle: book.title,
                expiryDate,
                eventType: "book_borrowed",
              },
              sendEmail: true,
              sendWebSocket: true,
            });
          } catch (notifError) {
            console.warn("Notification failed:", notifError.message);
          }
        }

        res.status(201).json({
          success: true,
          message: "Book borrowed successfully",
          data: {
            borrowId: borrow._id,
            bookTitle: book.title,
            expiryDate,
            daysRemaining: borrowDurationDays,
          },
        });
      } catch (txError) {
        await session.abortTransaction();
        throw txError;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error("Borrow book error:", error);
      
      // Handle duplicate key error (just in case)
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "You already have an active borrow for this book",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to borrow book",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  returnBook: async function(req, res) {
    console.log("returnBook method called");
    try {
      const { bookId } = req.params;
      const userId = req.user._id;

      // Find active borrow for this book
      const borrow = await Borrow.findOne({
        userId,
        resourceId: bookId,
        resourceType: "book",
        status: "active",
      });

      if (!borrow) {
        return res.status(404).json({
          success: false,
          message: "No active borrow found for this book",
        });
      }

      // Use transaction
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Update borrow status
        borrow.status = "returned";
        borrow.returnDate = new Date();
        await borrow.save({ session });

        // Increase available copies (release soft-lock)
        await Book.findByIdAndUpdate(
          bookId,
          { $inc: { availableCopies: 1 } },
          { session }
        );

        await session.commitTransaction();
        console.log("Book returned:", borrow._id);

        // Send notification
        if (notificationService?.createNotification) {
          try {
            await notificationService.createNotification({
              userId,
              title: "✅ Book Returned",
              message: `You have successfully returned "${borrow.resourceTitle}".`,
              type: "success",
              metadata: {
                resourceId: bookId,
                resourceTitle: borrow.resourceTitle,
                eventType: "book_returned",
              },
              sendEmail: false,
              sendWebSocket: true,
            });
          } catch (notifError) {
            console.warn("Notification failed:", notifError.message);
          }
        }

        res.json({
          success: true,
          message: "Book returned successfully",
          data: {
            borrowId: borrow._id,
            bookTitle: borrow.resourceTitle,
            borrowedOn: borrow.borrowDate,
            returnedOn: borrow.returnDate,
          },
        });
      } catch (txError) {
        await session.abortTransaction();
        throw txError;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error("Return book error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to return book",
      });
    }
  },

  accessBook: async function(req, res) {
    console.log("accessBook method called");
    try {
      const { bookId } = req.params;
      const userId = req.user._id;

      // Check if user has active, non-expired borrow
      const activeBorrow = await Borrow.findOne({
        userId,
        resourceId: bookId,
        resourceType: "book",
        status: "active",
        expiryDate: { $gte: new Date() }, // Not expired
      });

      if (!activeBorrow) {
        return res.status(403).json({
          success: false,
          message: "You don't have active access to this book. Please borrow it first.",
        });
      }

      // Get book details
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({
          success: false,
          message: "Book not found",
        });
      }

      // Return book access info
      res.json({
        success: true,
        data: {
          book: {
            id: book._id,
            title: book.title,
            author: book.author,
            description: book.description,
            coverImage: book.coverImage,
            fileUrl: book.fileUrl, // Digital book file URL
          },
          access: {
            expiryDate: activeBorrow.expiryDate,
            daysRemaining: Math.ceil(
              (activeBorrow.expiryDate - new Date()) / (1000 * 60 * 60 * 24)
            ),
            hoursRemaining: activeBorrow.getHoursRemaining(),
          },
        },
      });
    } catch (error) {
      console.error("Access book error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to access book",
      });
    }
  },

  // ... rest of your existing methods (createBorrow, getUserBorrows, etc.)

  createBorrow: async function(req, res) {
    console.log("createBorrow method called");
    try {
      const {
        resourceId,
        resourceType,
        resourceTitle,
        borrowDurationDays = 14,
      } = req.body;
      const userId = req.user._id;

      console.log("Creating borrow for user:", userId);

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
        borrowDate: new Date(),
        expiryDate,
        status: "active",
      });

      console.log("Borrow created:", borrow._id);

      // Try to send notification if service exists
      if (notificationService && notificationService.createNotification) {
        try {
          await notificationService.createNotification({
            userId,
            title: "📚 Borrow Successful",
            message: `You have successfully borrowed "${resourceTitle}". Due back on ${expiryDate.toLocaleDateString()}.`,
            type: "success",
            metadata: {
              resourceId,
              resourceTitle,
              expiryDate,
              eventType: "borrow_created",
            },
            sendEmail: true,
            sendWebSocket: true,
          });
        } catch (notifError) {
          console.warn("Notification failed:", notifError.message);
        }
      }

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
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  getUserBorrows: async function(req, res) {
    console.log("getUserBorrows method called");
    try {
      const userId = req.user._id;
      const { status = "active", page = 1, limit = 10 } = req.query;

      console.log("Getting borrows for user:", userId, "status:", status);

      const skip = (page - 1) * limit;

      const query = { userId };
      if (status && status !== 'all') {
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
  },

  getBorrowStats: async function(req, res) {
    console.log("getBorrowStats method called");
    try {
      const userId = req.user._id;
      console.log("Getting stats for user:", userId);

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
  },

  returnBorrow: async function(req, res) {
    console.log("returnBorrow method called");
    try {
      const { id } = req.params;
      const userId = req.user._id;

      console.log("Returning borrow ID:", id, "for user:", userId);

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

      // Try to send notification if service exists
      if (notificationService && notificationService.createNotification) {
        try {
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
        } catch (notifError) {
          console.warn("Notification failed:", notifError.message);
        }
      }

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
  },

  renewBorrow: async function(req, res) {
    console.log("renewBorrow method called");
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const { extensionDays = 7 } = req.body;

      console.log("Renewing borrow ID:", id, "for user:", userId);

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

      // Try to send notification if service exists
      if (notificationService && notificationService.createNotification) {
        try {
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
        } catch (notifError) {
          console.warn("Notification failed:", notifError.message);
        }
      }

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
  },
};

// Bind all methods to preserve context
const boundController = {

   borrowBook: borrowController.borrowBook.bind(borrowController),
  returnBook: borrowController.returnBook.bind(borrowController),
  accessBook: borrowController.accessBook.bind(borrowController),
  
  createBorrow: borrowController.createBorrow.bind(borrowController),
  getUserBorrows: borrowController.getUserBorrows.bind(borrowController),
  getBorrowStats: borrowController.getBorrowStats.bind(borrowController),
  returnBorrow: borrowController.returnBorrow.bind(borrowController),
  renewBorrow: borrowController.renewBorrow.bind(borrowController),
};

console.log("=== BORROW CONTROLLER LOADED ===");
console.log("Controller methods available:", Object.keys(boundController));
console.log("createBorrow exists?", typeof boundController.createBorrow);
console.log("getUserBorrows exists?", typeof boundController.getUserBorrows);

module.exports = boundController;