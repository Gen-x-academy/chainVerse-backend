const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

const initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId || decoded.id;
      socket.userEmail = decoded.email;

      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.userId}`);
    });

    socket.on("mark_notification_read", async (data) => {
      try {
        const { notificationId } = data;
        // Emit acknowledgment
        socket.emit("notification_marked_read", { notificationId });
      } catch (error) {
        socket.emit("error", {
          message: "Failed to mark notification as read",
        });
      }
    });
  });

  console.log("✅ WebSocket server initialized");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("WebSocket not initialized");
  }
  return io;
};

// Emit notification to specific user
const emitToUser = (userId, event, data) => {
  if (!io) {
    console.warn("WebSocket not initialized, cannot emit event");
    return;
  }
  io.to(`user:${userId}`).emit(event, data);
};

// Emit to multiple users
const emitToUsers = (userIds, event, data) => {
  if (!io) {
    console.warn("WebSocket not initialized, cannot emit event");
    return;
  }
  userIds.forEach((userId) => {
    io.to(`user:${userId}`).emit(event, data);
  });
};

module.exports = {
  initializeWebSocket,
  getIO,
  emitToUser,
  emitToUsers,
};
