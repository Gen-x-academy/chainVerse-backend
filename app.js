const express = require("express");
const dotEnv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const { handleMulterErrors } = require("./src/middlewares/errorHandler");
const {
  apiRateLimitMiddleware,
} = require("./src/middlewares/rateLimitMiddleware");
const rateLimitRoutes = require("./src/routes/rateLimitRoutes");

const organizationRoutes = require("./src/routes/organization");
const aboutSectionRoutes = require("./src/routes/aboutSectionRoutes");
const privacyPolicyRoutes = require("./src/routes/privacyPolicyRoutes");
const auth2FA = require("./src/routes/2factorRoute");
const logins = require("./src/routes/loginLogRoute");
const removalRequestRoutes = require("./src/routes/accountRemovalRoute");
const faqRoutes = require("./src/routes/faqRoute");
const financialAidRoutes = require("./src/routes/financialAidRoute");
const courseRoutes = require("./src/routes/courseRoute");
const courseReportRoutes = require("./src/routes/courseReportRoutes");
const contactUsRoutes = require("./src/routes/contactMessageRoute");
const adminFinancialAidRoutes = require("./src/routes/adminFinancialAidRoutes");
const nftRoutes = require("./src/routes/nftRoute");
const careerRoutes = require("./src/routes/careerRoutes");
const { initScheduler } = require("./src/services/reportScheduler");
const borrowScheduler = require("./src/scheduler/borrowScheduler");
const studyGroupRoutes = require("./src/routes/studyGroupRoutes");
const sessionRoutes = require("./src/routes/sessionRoute");
const guestCartRoutes = require("./src/routes/guestCartRoute");
const studentCartRoutes = require("./src/routes/studentCartRoutes");
const adminAccountRoutes = require("./src/routes/adminAccountRoutes");
const studentAccountRoutes = require("./src/routes/studentAccountRoutes");
const borrowRoutes = require("./src/routes/borrowRoutes");
const notificationRoutes = require("./src/routes/notifications");
const bookReviewRoutes = require("./src/routes/bookReviewRoutes");
const libraryAnalyticsRoutes = require("./src/routes/libraryAnalyticsRoutes");
// const setupSwaggerDocs = require('./swagger');

const dbConnection = require("./src/config/database/connection");
const router = require("./src/routes/index");
const quizRoutes = require("./src/routes/quizRoute");
// const cartRoutes = require('./routes/cartRoutes');

const app = express();
dotEnv.config();
if (process.env.NODE_ENV !== "test") {
  dbConnection();
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(morgan("dev"));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Error middleware
app.use(handleMulterErrors);

// Rate limiting middleware (apply globally before routes)
app.use(apiRateLimitMiddleware);

// Rate limit management routes
app.use("/api/rate-limit", rateLimitRoutes);

// Routes
app.use("/sessions", sessionRoutes);
app.use("/api", router);
app.use("/organization", organizationRoutes);
app.use("/auth", auth2FA);
app.use("/auth", logins);
app.use("/admin", require("./src/routes/admin"));
app.use("/admin", adminAccountRoutes);
app.use("/platform-info", require("./src/routes/platformInfo"));
app.use("/api/study-groups", studyGroupRoutes);
app.use("/admin/subscription", require("./src/routes/subscriptionPlanRoutes"));
app.use("/settings", privacyPolicyRoutes);
app.use("/section", aboutSectionRoutes);
app.use("/api", removalRequestRoutes);
app.use("/reports", courseReportRoutes);
app.use("/settings/faqs", faqRoutes);
app.use("/financial-aid", financialAidRoutes);
app.use("/api", courseRoutes);
app.use("/api", contactUsRoutes);
app.use("/admin/financial-aid", adminFinancialAidRoutes);
app.use("/api", nftRoutes);
app.use("/api", careerRoutes);
app.use("/api", guestCartRoutes);
app.use("/api", studentCartRoutes);
app.use("/student", studentAccountRoutes);
app.use("/api/borrows", borrowRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/books", bookReviewRoutes);
app.use("/api/analytics/library", libraryAnalyticsRoutes);
// app.use('/api/cart', cartRoutes);

// --- Add Quiz routes (RESTful path, e.g. /api/quizzes) ---
app.use("/api/quizzes", quizRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to ChainVerse Academy");
});

// Swagger
// setupSwaggerDocs(app);

// 404 handler
app.use((req, res, next) => {
  const error = new Error("Not found");
  error.status = 404;
  next(error);
});

// Global error handler
app.use((error, req, res, next) => {
  res.status(error.status || 500).send({
    status: error.status || 500,
    message: error.message,
    body: {},
  });
});

// Initialize report scheduler
initScheduler();

// Initialize borrow scheduler
borrowScheduler.init();

module.exports = app;
