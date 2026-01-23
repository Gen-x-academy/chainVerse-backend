jest.mock("../../../models/course");
jest.mock("../../../models/enrollment");
jest.mock("../../../models/ChallengeResult");

const Course = require("../../../models/course");
const Enrollment = require("../../../models/enrollment");
const ChallengeResult = require("../../../models/ChallengeResult");

const { getNextCourseRecommendations } = require("../recommendation.service");

describe("Recommendation Service – Rule Application", () => {
  const userId = "user_1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("applies NEXT_COURSE_SEQUENCE rule", async () => {
    Enrollment.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        {
          course: {
            _id: "courseA",
            title: "Intro to Web3",
            level: "beginner",
          },
        },
      ]),
    });

    Course.find.mockResolvedValue([
      {
        _id: "courseB",
        title: "Solidity Fundamentals",
        prerequisite: "courseA",
        level: "intermediate",
      },
    ]);

    ChallengeResult.find.mockResolvedValue([]);

    const recommendations = await getNextCourseRecommendations(userId);

    expect(recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseId: "courseB",
          title: "Solidity Fundamentals",
          reason: expect.stringContaining("Intro to Web3"),
        }),
      ]),
    );
  });

  it("applies LOW_QUIZ_SCORE_REMEDIAL rule", async () => {
    Enrollment.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        {
          course: { _id: "courseA", level: "beginner" },
        },
      ]),
    });

    Course.find.mockResolvedValue([
      {
        _id: "courseY",
        title: "Solidity Basics",
        isRemedial: true,
        skill: "Solidity",
      },
    ]);

    ChallengeResult.find.mockResolvedValue([{ score: 35, skill: "Solidity" }]);

    const recommendations = await getNextCourseRecommendations(userId);

    expect(recommendations[0]).toMatchObject({
      courseId: "courseY",
      title: "Solidity Basics",
      reason: expect.stringContaining("Solidity"),
    });
  });

  it("returns empty array when no rules apply", async () => {
    Enrollment.find.mockResolvedValue([]);
    Course.find.mockResolvedValue([]);
    ChallengeResult.find.mockResolvedValue([]);

    const recommendations = await getNextCourseRecommendations(userId);

    expect(recommendations).toEqual([]);
  });
});
