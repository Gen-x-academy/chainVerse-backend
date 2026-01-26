const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const jwt = require("jsonwebtoken");

let mongoServer;
let app;

const User = require("../models/User");
const Course = require("../models/course");

describe("Saved Courses integration tests", () => {
  let studentToken, adminToken, tutorToken;
  let student, admin, tutor;
  let course;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;
    process.env.JWT_SECRET = "testsecret";

    // Create a minimal express app that mounts only the savedCourse routes
    // This is to avoid loading the whole server and unrelated routes during tests.
    const express = require("express");
    const savedCourseRoutes = require("../routes/savedCourseRoutes");
    app = express();
    app.use(express.json());
    app.use("/api", savedCourseRoutes);

    // connect mongoose to the in-memory server
    await mongoose.connect(uri, {});

    // create test users and a course
    student = await User.create({
      email: "student@test.com",
      password: "password",
      role: "student",
    });
    admin = await User.create({
      email: "admin@test.com",
      password: "password",
      role: "admin",
    });
    tutor = await User.create({
      email: "tutor@test.com",
      password: "password",
      role: "tutor",
    });

    studentToken = jwt.sign(
      { _id: student._id, role: "student" },
      process.env.JWT_SECRET,
    );
    adminToken = jwt.sign(
      { _id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
    );
    tutorToken = jwt.sign(
      { _id: tutor._id, role: "tutor" },
      process.env.JWT_SECRET,
    );

    course = await Course.create({
      title: "Test Course",
      description: "Desc",
      tutor: tutor._id,
      tutorEmail: tutor.email,
      tutorName: tutor.fullName || "Test Tutor",
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    // ensure student.savedCourses reset
    await User.updateOne({ _id: student._id }, { $set: { savedCourses: [] } });
  });

  test("Save success", async () => {
    const res = await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("message", "Course saved for later");
  });

  test("Duplicate save returns 400", async () => {
    // first save
    await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    // second save
    const res2 = await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    expect(res2.status).toBe(400);
    expect(res2.body).toHaveProperty("error", "Course already saved");
  });

  test("Save invalid course id (malformed) returns 400", async () => {
    const res = await request(app)
      .post(`/api/student/save/123/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    expect(res.status).toBe(400);
  });

  test("Save non-existent course id returns 404", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/student/save/${fakeId}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Course not found");
  });

  test("Get saved for owner and admin", async () => {
    // ensure saved
    await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    const resOwner = await request(app)
      .get(`/api/student/save/${student._id}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(resOwner.status).toBe(200);
    expect(Array.isArray(resOwner.body.savedCourses)).toBe(true);

    const resAdmin = await request(app)
      .get(`/api/student/save/${student._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(resAdmin.status).toBe(200);
    expect(Array.isArray(resAdmin.body.savedCourses)).toBe(true);
  });

  test("Get when empty returns empty array", async () => {
    // ensure empty
    await User.updateOne({ _id: student._id }, { $set: { savedCourses: [] } });

    const res = await request(app)
      .get(`/api/student/save/${student._id}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.savedCourses)).toBe(true);
    expect(res.body.savedCourses.length).toBe(0);
  });

  test("Delete success and deletion confirmed", async () => {
    // save first
    await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send();

    const del = await request(app)
      .delete(`/api/student/save/${course._id}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(del.status).toBe(200);
    expect(del.body).toHaveProperty("message", "Saved course removed");

    // verify not present
    const res = await request(app)
      .get(`/api/student/save/${student._id}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(
      res.body.savedCourses.find((c) => String(c._id) === String(course._id)),
    ).toBeUndefined();
  });

  test("Delete not-saved returns 404", async () => {
    // ensure not saved
    await User.updateOne({ _id: student._id }, { $set: { savedCourses: [] } });

    const del = await request(app)
      .delete(`/api/student/save/${course._id}`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(del.status).toBe(404);
    expect(del.body).toHaveProperty("error", "Saved course not found");
  });

  test("Delete invalid id format returns 400", async () => {
    const del = await request(app)
      .delete("/api/student/save/123")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(del.status).toBe(400);
  });

  test("Unauthorized access: no token and wrong role", async () => {
    const resNoToken = await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .send();
    expect(resNoToken.status).toBe(401);

    const resWrongRole = await request(app)
      .post(`/api/student/save/${course._id}/add`)
      .set("Authorization", `Bearer ${tutorToken}`)
      .send();
    expect(resWrongRole.status).toBe(403);
  });
});
