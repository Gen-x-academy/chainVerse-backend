const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../../app");
const User = require("../../models/User");
const Course = require("../../models/course");
const Borrow = require("../../models/borrow");
const jwt = require("jsonwebtoken");

describe("Library Dashboard API", () => {
  let authToken;
  let userId;
  let courseId;
  let borrowId;

  beforeAll(async () => {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/chainverse-test",
    );
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Course.deleteMany({});
    await Borrow.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Course.deleteMany({});
    await Borrow.deleteMany({});

    const user = await User.create({
      email: "student@test.com",
      password: "password123",
      fullName: "Test Student",
      role: "student",
      isEmailVerified: true,
    });

    userId = user._id;
    authToken = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET || "test-secret",
    );

    const tutor = await User.create({
      email: "tutor@test.com",
      password: "password123",
      fullName: "Test Tutor",
      role: "tutor",
      isEmailVerified: true,
    });

    const course = await Course.create({
      title: "Test Course",
      description: "Test Description",
      tutor: tutor._id,
      tutorEmail: tutor.email,
      tutorName: tutor.fullName,
      isPublished: true,
      status: "published",
    });

    courseId = course._id;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const borrow = await Borrow.create({
      userId,
      courseId,
      borrowedAt: new Date(),
      expiresAt,
      status: "active",
      progress: 0,
    });

    borrowId = borrow._id;
  });

  describe("GET /api/library", () => {
    it("should return user library with active borrows", async () => {
      const response = await request(app)
        .get("/api/library")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("active");
      expect(response.body.data).toHaveProperty("expired");
      expect(response.body.data).toHaveProperty("history");
      expect(response.body.data.active.length).toBe(1);
      expect(response.body.data.active[0]).toHaveProperty("remainingSeconds");
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/library");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/library/return/:borrowId", () => {
    it("should return a borrowed course", async () => {
      const response = await request(app)
        .post(`/api/library/return/${borrowId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe("returned");
      expect(response.body.data).toHaveProperty("returnedAt");
    });

    it("should return 404 for non-existent borrow", async () => {
      const fakeBorrowId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/library/return/${fakeBorrowId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/library/progress/:borrowId", () => {
    it("should update borrow progress", async () => {
      const response = await request(app)
        .patch(`/api/library/progress/${borrowId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ progress: 50 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.progress).toBe(50);
    });

    it("should auto-complete when progress reaches 100", async () => {
      const response = await request(app)
        .patch(`/api/library/progress/${borrowId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ progress: 100 });

      expect(response.status).toBe(200);
      expect(response.body.data.progress).toBe(100);
      expect(response.body.data.status).toBe("completed");
    });

    it("should return 400 for invalid progress", async () => {
      const response = await request(app)
        .patch(`/api/library/progress/${borrowId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ progress: 150 });

      expect(response.status).toBe(400);
    });
  });
});
