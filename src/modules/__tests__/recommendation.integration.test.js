const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../../app");
const Course = require("../../models/course");
const Enrollment = require("../../models/enrollment");
const ChallengeResult = require("../../models/ChallengeResult");
const User = require("../../models/User");
const jwt = require("jsonwebtoken");

describe("GET /api/recommendation/next-courses", () => {
  let token;
  let user;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    user = await User.create({
      email: "test@chainverse.io",
      password: "Password123!",
    });

    token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("returns recommended courses based on user history", async () => {
    const courseA = await Course.create({
      title: "Intro to Web3",
      description: "Learn the basics of Web3",
      level: "Beginner",
      tutor: user._id,
      tutorEmail: user.email,
      tutorName: user.fullName || "Test Tutor",
      isPublished: true,
    });

    const courseB = await Course.create({
      title: "Solidity Fundamentals",
      description: "Learn Solidity programming",
      level: "Intermediate",
      prerequisite: courseA._id,
      tutor: user._id,
      tutorEmail: user.email,
      tutorName: user.fullName || "Test Tutor",
      isPublished: true,
    });

    const enrollment = await Enrollment.create({
      studentId: user._id,
      courseId: courseA._id,
      completed: true,
    });

    const res = await request(app)
      .get("/api/recommendation/next-courses")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseId: courseB._id.toString(),
          title: "Solidity Fundamentals",
          reason: expect.stringContaining("Intro to Web3"),
        }),
      ]),
    );
  });
});
