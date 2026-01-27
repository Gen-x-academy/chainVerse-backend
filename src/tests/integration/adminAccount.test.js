const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../../app");
const User = require("../../models/User");

// -------------------------------------------------------------------------
// 1. MOCK DEPENDENCIES
// -------------------------------------------------------------------------
const MOCK_ADMIN_ID = new mongoose.Types.ObjectId();

// Mock Auth Middleware (Fixes "Router.use" error & Bypasses Login)
jest.mock("../../middlewares/auth", () => ({
  authenticate: (req, res, next) => {
    req.user = {
      _id: MOCK_ADMIN_ID,
      role: "admin",
      email: "admin_test@chainverse.com",
    };
    next();
  },
  // Fixes crash in courseRoute.js
  hasRole: (roles) => (req, res, next) => next(),
  // Fixes crash in courseReportRoutes.js
  isAdminOrStaff: (req, res, next) => next(),
}));

// Mock Admin Middleware
jest.mock("../../middlewares/admin", () => ({
  ensureAdmin: (req, res, next) => next(),
}));

// Mock File Upload (For the Image Test)
// We force the middleware to say "File uploaded successfully" without doing real work
jest.mock("../../middlewares/fileUpload", () => ({
  upload: {
    single: (fieldName) => (req, res, next) => {
      // Inject a fake file object so the controller thinks it worked
      req.file = {
        path: "https://fake-s3-bucket.com/new-profile-pic.png",
        location: "https://fake-s3-bucket.com/new-profile-pic.png",
      };
      next();
    },
  },
}));

// -------------------------------------------------------------------------
// 2. THE TEST SUITE
// -------------------------------------------------------------------------
describe("Admin Account Settings Features", () => {
  // Setup: Create the Admin User
  beforeAll(async () => {
    // await mongoose.connect(process.env.MONGO_URI); // Uncomment if needed
    await User.create({
      _id: MOCK_ADMIN_ID,
      fullName: "Original Admin Name",
      email: "admin_test@chainverse.com",
      password: "password123",
      role: "admin",
      isEmailVerified: true,
    });
  });

  afterAll(async () => {
    await User.deleteMany({ email: "admin_test@chainverse.com" });
    // await mongoose.connection.close();
  });

  // Test 1: GET Profile
  test("GET /admin/account - Should retrieve admin details", async () => {
    const res = await request(app).get("/admin/account");
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("admin_test@chainverse.com");
  });

  // Test 2: Update Profile
  test("PUT /admin/account/update - Should update profile info", async () => {
    const res = await request(app).put("/admin/account/update").send({
      fullName: "Updated Admin Name",
      email: "admin_test@chainverse.com",
      phoneNumber: "1234567890",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.fullName).toBe("Updated Admin Name");
  });

  // Test 3: Change Password
  test("PUT /admin/account/change-password - Should change password", async () => {
    const res = await request(app).put("/admin/account/change-password").send({
      currentPassword: "password123",
      newPassword: "NewSecurePassword1@",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/password changed/i);
  });

  // Test 4: Upload Profile Image (New)
  test("POST /admin/account/upload-profile-image - Should update profile image URL", async () => {
    const res = await request(app)
      .post("/admin/account/upload-profile-image")
      .attach("profileImage", Buffer.from("fake image"), "profile.png");

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    // This URL comes from jest.mock above
    expect(res.body.data.profileImage).toBe(
      "https://fake-s3-bucket.com/new-profile-pic.png",
    );

    // Verify it updated in the DB
    const updatedUser = await User.findById(MOCK_ADMIN_ID);
    expect(updatedUser.profileImage).toBe(
      "https://fake-s3-bucket.com/new-profile-pic.png",
    );
  });
});
