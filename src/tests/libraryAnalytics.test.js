const mongoose = require("mongoose");
const libraryAnalyticsService = require("../services/libraryAnalyticsService");
const LibraryEvent = require("../models/LibraryEvent");
const LibraryAnalytics = require("../models/LibraryAnalytics");
const Book = require("../models/book");
const Course = require("../models/course");
const Enrollment = require("../models/enrollment");

const { connectTestDB, disconnectTestDB, clearTestDB } = require("./testUtils");

describe("Library Analytics Integration", () => {
  let testUser;
  let testBook;
  let testCourse;

  beforeAll(async () => {
    await connectTestDB();
    testUser = new mongoose.Types.ObjectId();

    testBook = await Book.create({
      title: "Test Library Analytics Book",
      author: "Test Author",
      category: "Education",
      isActive: true,
    });

    testCourse = await Course.create({
      title: "Test Library Course",
      description: "Test Course Description",
      tutor: new mongoose.Types.ObjectId(),
      tutorEmail: "tutor@test.com",
      tutorName: "Test Tutor",
      recommendedBooks: [{ book: testBook._id, required: true }],
    });

    await Enrollment.create({
      courseId: testCourse._id,
      studentId: testUser,
      completed: false,
    });
  });

  afterAll(async () => {
    await Book.deleteMany({ _id: testBook._id });
    await Course.deleteMany({ _id: testCourse._id });
    await Enrollment.deleteMany({ studentId: testUser });
    await LibraryEvent.deleteMany({ userId: testUser });
    await LibraryAnalytics.deleteMany({});
    await disconnectTestDB();
  });

  test("should track a BORROW event and auto-detect course linkage", async () => {
    const event = await libraryAnalyticsService.trackEvent({
      userId: testUser,
      action: "BORROW",
      resourceId: testBook._id,
      resourceType: "book",
    });

    expect(event).toBeDefined();
    expect(event.action).toBe("BORROW");
    expect(event.metadata.courseId.toString()).toBe(testCourse._id.toString());
  });

  test("should track a PROGRESS_UPDATE event", async () => {
    const event = await libraryAnalyticsService.trackEvent({
      userId: testUser,
      action: "PROGRESS_UPDATE",
      resourceId: testBook._id,
      value: 50,
    });

    expect(event).toBeDefined();
    expect(event.value).toBe(50);
  });

  test("should aggregate stats correctly", async () => {
    // Manually trigger aggregation
    const stats = await libraryAnalyticsService.aggregateStats("daily");

    expect(stats.metrics.totalBorrows).toBeGreaterThan(0);
    expect(stats.metrics.activeReaders).toBe(1);
    expect(stats.metrics.mostBorrowedBooks.length).toBeGreaterThan(0);
    expect(stats.metrics.mostBorrowedBooks[0].title).toBe(testBook.title);

    // Check course linked engagement
    expect(stats.metrics.courseLinkedEngagement.length).toBe(1);
    expect(stats.metrics.courseLinkedEngagement[0].courseTitle).toBe(
      testCourse.title,
    );
    expect(stats.metrics.courseLinkedEngagement[0].borrowCount).toBe(1);
  });
});
