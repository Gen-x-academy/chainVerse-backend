const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const jwt = require("jsonwebtoken");

let mongoServer;
let app;

const Tutor = require("../models/tutors");
const Course = require("../models/course");
const Assignment = require("../models/assignment");

describe("Tutor Course & Assignment Management Integration Tests", () => {
    let tutorToken;
    let otherTutorToken;
    let tutor;
    let otherTutor;
    let course;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        process.env.MONGO_URI = uri;
        process.env.JWT_ACCESS_TOKEN = "testsecret_access"; // Set specific secret for tutor auth

        // Create a minimal express app
        const express = require("express");
        const courseRoutes = require("../routes/courseRoute");
        const assignmentRoutes = require("../routes/assignmentRoute");
        app = express();
        app.use(express.json());

        // Mock logger to avoid clutter
        jest.mock('../utils/logger', () => ({
            error: jest.fn(),
            info: jest.fn()
        }));

        // Mock bullmq to avoid redis connection
        jest.mock('bullmq', () => ({
            Queue: jest.fn().mockImplementation(() => ({
                add: jest.fn()
            })),
            Worker: jest.fn()
        }));

        // Mock ioredis
        jest.mock('ioredis', () => require('jest-mock-extended').mockDeep());

        // Mount routes
        // Note: In real app these are under /api/v1/courses etc. Here we mount root or matching expected paths.
        // courseRoutes handles /courses paths internally? No, route definitions are router.post('/courses', ...)
        // So if we mount at /, it will be /courses
        app.use("/", courseRoutes);
        app.use("/", assignmentRoutes);

        await mongoose.connect(uri, {});

        // Create Test Tutor
        tutor = await Tutor.create({
            fullName: "Test Tutor",
            email: "tutor@test.com",
            password: "hashedpassword",
            web3Expertise: "DeFi",
            experience: 5,
            verified: true,
            role: 'tutor'
        });

        // Create Another Tutor for RBAC
        otherTutor = await Tutor.create({
            fullName: "Other Tutor",
            email: "other@test.com",
            password: "hashedpassword",
            web3Expertise: "NFT",
            experience: 3,
            verified: true,
            role: 'tutor'
        });

        // Sign Tokens (tutorAuth expects 'sub')
        tutorToken = jwt.sign(
            { sub: tutor._id, role: "tutor" },
            process.env.JWT_ACCESS_TOKEN
        );

        otherTutorToken = jwt.sign(
            { sub: otherTutor._id, role: "tutor" },
            process.env.JWT_ACCESS_TOKEN
        );
    });

    afterAll(async () => {
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });

    // COURSE TESTS
    describe("Course Management", () => {
        test("Tutor can create a course", async () => {
            const res = await request(app)
                .post("/courses")
                .set("Authorization", `Bearer ${tutorToken}`)
                .send({
                    title: "Intro to DeFi",
                    description: "Comprehensive guide",
                    category: "DeFi",
                    level: "Beginner"
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.title).toBe("Intro to DeFi");
            expect(res.body.data.tutor).toBe(tutor._id.toString());

            course = res.body.data; // Save for update/delete tests
        });

        test("Non-tutor/Unauth cannot create course", async () => {
            const res = await request(app)
                .post("/courses")
                .send({ title: "Hack" });
            expect(res.status).toBe(401);
        });

        test("Tutor can update their own course", async () => {
            const res = await request(app)
                .put(`/courses/${course._id}`)
                .set("Authorization", `Bearer ${tutorToken}`)
                .send({
                    title: "Advanced DeFi",
                    description: "Updated description"
                });

            expect(res.status).toBe(200);
            expect(res.body.data.title).toBe("Advanced DeFi");
        });

        test("Tutor cannot update another tutor's course", async () => {
            const res = await request(app)
                .put(`/courses/${course._id}`)
                .set("Authorization", `Bearer ${otherTutorToken}`)
                .send({
                    title: "Hacked DeFi"
                });

            expect(res.status).toBe(403);
        });

        test("Tutor can delete their own course", async () => {
            // Create a temp course to delete so we don't break subsequent tests if any
            const tempRes = await request(app)
                .post("/courses")
                .set("Authorization", `Bearer ${tutorToken}`)
                .send({
                    title: "Temp Course",
                    description: "To delete"
                });
            const tempCourseId = tempRes.body.data._id;

            const delRes = await request(app)
                .delete(`/courses/${tempCourseId}`)
                .set("Authorization", `Bearer ${tutorToken}`);

            expect(delRes.status).toBe(200);

            // Verify gone
            const check = await Course.findById(tempCourseId);
            expect(check).toBeNull();
        });
    });

    // ASSIGNMENT TESTS
    describe("Assignment Management", () => {
        test("Tutor can create assignment for their course", async () => {
            const res = await request(app)
                .post("/assignments")
                .set("Authorization", `Bearer ${tutorToken}`)
                .send({
                    title: "DeFi Quiz 1",
                    description: "Complete the quiz",
                    dueDate: new Date(Date.now() + 86400000), // Tomorrow
                    courseId: course._id
                });

            expect(res.status).toBe(201);
            expect(res.body.data.title).toBe("DeFi Quiz 1");
            expect(res.body.data.tutorId).toBe(tutor._id.toString());
        });

        test("Tutor cannot create assignment for another tutor's course", async () => {
            // Other tutor creates a course
            const otherCourse = await Course.create({
                title: "NFT 101",
                description: "NFT Intro",
                tutor: otherTutor._id,
                tutorEmail: otherTutor.email,
                tutorName: otherTutor.fullName
            });

            const res = await request(app)
                .post("/assignments")
                .set("Authorization", `Bearer ${tutorToken}`) // First tutor trying to assign to Other Tutor's course
                .send({
                    title: "Malicious Assignment",
                    description: "...",
                    dueDate: new Date(),
                    courseId: otherCourse._id
                });

            expect(res.status).toBe(403);
        });

        test("Get assignments for a course", async () => {
            const res = await request(app)
                .get(`/assignments/${course._id}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.length).toBeGreaterThan(0);
        });
    });
});
