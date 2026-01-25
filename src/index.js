const http = require("http");
const app = require("./app");
const { initializeWebSocket } = require("./src/config/websocket");
const borrowScheduler = require("./src/scheduler/borrowScheduler");
require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("ChainVerse Certificate Generator API is running");
});

app.use("/api/challenges", require("./routes/challengeRoutes"));

const PORT = process.env.PORT || 3000;
// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Initialize borrow notification scheduler
borrowScheduler.init();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server is ready`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  borrowScheduler.stopAll();
  server.close(() => {
    console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  borrowScheduler.stopAll();
  server.close(() => {
    console.log("HTTP server closed");
  });
});
