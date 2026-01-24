const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const Quiz = require("../../models/Quiz");
const User = require("../../models/User");

let mongoServer;
let app;
let server;
let agent;

beforeAll(async () => {
  // Start in-memory MongoDB first
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Now require the app after DB is connected
  app = require("../../../app");

  // Start the app
  server = app.listen(3001); // Use a different port for testing
  agent = request.agent(server);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  server.close();
});

beforeEach(async () => {
  // Clear collections
  await Quiz.deleteMany({});
  await User.deleteMany({});
});

describe("Quiz CRUD API", () => {
  let adminUser;
  let tutorUser;
  let studentUser;
  let quizData;

  beforeEach(async () => {
    // Create test users
    adminUser = new User({
      fullName: "Admin User",
      email: "admin@test.com",
      password: "hashedpassword",
      role: "admin",
    });
    await adminUser.save();

    tutorUser = new User({
      fullName: "Tutor User",
      email: "tutor@test.com",
      password: "hashedpassword",
      role: "tutor",
    });
    await tutorUser.save();

    studentUser = new User({
      fullName: "Student User",
      email: "student@test.com",
      password: "hashedpassword",
      role: "student",
    });
    await studentUser.save();

    // Sample quiz data
    quizData = {
      courseId: "123e4567-e89b-12d3-a456-426614174000",
      moduleId: "123e4567-e89b-12d3-a456-426614174001",
      title: "Sample Quiz",
      description: "A test quiz",
      questions: [
        {
          text: "What is 2+2?",
          options: [
            { text: "3", isCorrect: false },
            { text: "4", isCorrect: true },
            { text: "5", isCorrect: false },
          ],
          explanation: "Basic math",
        },
        {
          text: "What is the capital of France?",
          options: [
            { text: "London", isCorrect: false },
            { text: "Paris", isCorrect: true },
            { text: "Berlin", isCorrect: false },
          ],
        },
        {
          text: "What does HTML stand for?",
          options: [
            { text: "Hyper Text Markup Language", isCorrect: true },
            { text: "High Tech Modern Language", isCorrect: false },
            { text: "Home Tool Management List", isCorrect: false },
          ],
          explanation: "HTML is the standard markup language for web pages",
        },
        {
          text: "Which of these is a JavaScript framework?",
          options: [
            { text: "Django", isCorrect: false },
            { text: "React", isCorrect: true },
            { text: "Laravel", isCorrect: false },
          ],
        },
        {
          text: "What does CSS stand for?",
          options: [
            { text: "Computer Style Sheets", isCorrect: false },
            { text: "Cascading Style Sheets", isCorrect: true },
            { text: "Creative Style System", isCorrect: false },
          ],
          explanation:
            "CSS is used for describing the presentation of web pages",
        },
      ],
    };
  });

  describe("POST /api/quizzes", () => {
    it("should create a quiz successfully for admin", async () => {
      const response = await request(app)
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(quizData);

      if (response.status !== 201) {
        console.log("Response status:", response.status);
        console.log("Response body:", JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Quiz created successfully");
      expect(response.body.data.title).toBe(quizData.title);
      expect(response.body.data.questions).toHaveLength(5);
    });

    it("should create a quiz successfully for tutor", async () => {
      const response = await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(tutorUser)}`)
        .send(quizData);

      expect(response.status).toBe(201);
    });

    it("should reject creation by student", async () => {
      const response = await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(studentUser)}`)
        .send(quizData);

      expect(response.status).toBe(403);
    });

    it("should validate required fields", async () => {
      const invalidData = { title: "Test" }; // Missing required fields

      const response = await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
    });

    it("should enforce minimum questions", async () => {
      const invalidData = {
        ...quizData,
        questions: [quizData.questions[0]], // Only 1 question
      };

      const response = await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(invalidData);

      expect(response.status).toBe(400);
    });

    it("should prevent duplicate quiz titles in same module", async () => {
      // Create first quiz
      await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(quizData);

      // Try to create duplicate
      const response = await agent
        .post("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(quizData);
      if (response.status !== 201) {
        console.log("Response status:", response.status);
        console.log("Response body:", JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("DUPLICATE_QUIZ_TITLE");
    });
  });

  describe("GET /api/quizzes/:quizId", () => {
    let quiz;

    beforeEach(async () => {
      quiz = new Quiz({
        ...quizData,
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quiz.save();
    });

    it("should retrieve quiz for admin with answers", async () => {
      const response = await agent
        .get(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .query({ includeAnswers: "true" });

      expect(response.status).toBe(200);
      expect(response.body.data.questions[0].options[1].isCorrect).toBe(true);
    });

    it("should retrieve quiz for student without answers", async () => {
      const response = await agent
        .get(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(studentUser)}`);

      expect(response.status).toBe(200);
      expect(response.body.data.questions[0].options[0]).not.toHaveProperty(
        "isCorrect",
      );
    });

    it("should return 404 for non-existent quiz", async () => {
      const response = await agent
        .get("/api/quizzes/123e4567-e89b-12d3-a456-426614174999")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("QUIZ_NOT_FOUND");
    });
  });

  describe("PUT /api/quizzes/:quizId", () => {
    let quiz;

    beforeEach(async () => {
      quiz = new Quiz({
        ...quizData,
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quiz.save();
    });

    it("should update quiz successfully", async () => {
      const updateData = {
        title: "Updated Quiz Title",
        description: "Updated description",
      };

      const response = await agent
        .put(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.version).toBe(2);
    });

    it("should reject update by student", async () => {
      const response = await agent
        .put(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(studentUser)}`)
        .send({ title: "New Title" });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /api/quizzes/:quizId", () => {
    let quiz;

    beforeEach(async () => {
      quiz = new Quiz({
        ...quizData,
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quiz.save();
    });

    it("should soft delete quiz for admin", async () => {
      const response = await agent
        .delete(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`);

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("QUIZ_SOFT_DELETED");

      // Verify quiz is soft deleted
      const deletedQuiz = await Quiz.findById(quiz._id);
      expect(deletedQuiz.isActive).toBe(false);
    });

    it("should hard delete quiz for admin with permanent flag", async () => {
      const response = await agent
        .delete(`/api/quizzes/${quiz._id}`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .query({ permanent: "true" });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("QUIZ_PERMANENTLY_DELETED");

      // Verify quiz is deleted
      const deletedQuiz = await Quiz.findById(quiz._id);
      expect(deletedQuiz).toBeNull();
    });
  });

  describe("DELETE /api/quizzes/:quizId/questions/:questionId", () => {
    let quiz;

    beforeEach(async () => {
      quiz = new Quiz({
        ...quizData,
        questions: [
          ...quizData.questions,
          {
            text: "Third question",
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ],
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quiz.save();
    });

    it("should delete a question successfully", async () => {
      console.log("Quiz has", quiz.questions.length, "questions");
      const questionId = quiz.questions[0]._id;
      console.log("Deleting question", questionId);

      const response = await request(app)
        .delete(`/api/quizzes/${quiz._id}/questions/${questionId}`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`);

      console.log("Response status:", response.status);
      if (response.status !== 200) {
        console.log("Response body:", JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(200);
      expect(response.body.meta.remainingQuestions).toBe(5);
    });

    it("should prevent deletion if it would violate minimum questions", async () => {
      // Delete questions until only 5 remain, then try to delete one more
      const quizWith5Questions = new Quiz({
        ...quizData,
        questions: Array(5)
          .fill()
          .map((_, i) => ({
            text: `Question ${i + 1}`,
            options: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          })),
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quizWith5Questions.save();

      const questionId = quizWith5Questions.questions[0]._id;

      const response = await agent
        .delete(
          `/api/quizzes/${quizWith5Questions._id}/questions/${questionId}`,
        )
        .set("Authorization", `Bearer ${generateToken(adminUser)}`);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("MINIMUM_QUESTIONS_REQUIRED");
    });
  });

  describe("POST /api/quizzes/:quizId/questions", () => {
    let quiz;

    beforeEach(async () => {
      quiz = new Quiz({
        ...quizData,
        createdBy: adminUser._id,
        updatedBy: adminUser._id,
      });
      await quiz.save();
    });

    it("should add a question successfully", async () => {
      const newQuestion = {
        text: "New question?",
        options: [
          { text: "Yes", isCorrect: true },
          { text: "No", isCorrect: false },
        ],
        explanation: "Simple yes/no",
      };

      const response = await agent
        .post(`/api/quizzes/${quiz._id}/questions`)
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .send(newQuestion);

      expect(response.status).toBe(201);
      expect(response.body.meta.totalQuestions).toBe(6);
    });
  });

  describe("GET /api/quizzes", () => {
    beforeEach(async () => {
      const quizzes = [
        {
          ...quizData,
          title: "Quiz 1",
          createdBy: adminUser._id,
          updatedBy: adminUser._id,
        },
        {
          ...quizData,
          title: "Quiz 2",
          moduleId: "123e4567-e89b-12d3-a456-426614174002",
          createdBy: adminUser._id,
          updatedBy: adminUser._id,
        },
      ];

      for (const q of quizzes) {
        const quiz = new Quiz(q);
        await quiz.save();
      }
    });

    it("should retrieve quizzes with pagination", async () => {
      const response = await agent
        .get("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(2);
      expect(response.body.data).toHaveLength(2);
    });

    it("should filter quizzes by courseId", async () => {
      const response = await agent
        .get("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .query({ courseId: quizData.courseId });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it("should search quizzes by title", async () => {
      const response = await agent
        .get("/api/quizzes")
        .set("Authorization", `Bearer ${generateToken(adminUser)}`)
        .query({ search: "Quiz 1" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe("Quiz 1");
    });
  });
});

// Helper function to generate JWT token (you'll need to implement this based on your auth system)
function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || "testsecret",
    { expiresIn: "1h" },
  );
}
