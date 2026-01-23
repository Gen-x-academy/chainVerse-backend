const Course = require("../models/course");
const Enrollment = require("../models/enrollment");
const ChallengeResult = require("../models/ChallengeResult");
const { rules } = require("./recommendation.rules");

exports.getNextCourseRecommendations = async (userId) => {
  const enrollments = await Enrollment.find({
    studentId: userId,
    completed: true,
  }).populate("courseId");

  if (!enrollments.length) {
    return [];
  }

  const completedCourses = enrollments.map((e) => e.courseId);
  const allCourses = await Course.find({ isPublished: true });

  const quizResults = await ChallengeResult.find({ playerOneId: userId });

  const context = {
    completedCourses,
    allCourses,
    quizResults,
    remedialCourses: allCourses.filter((c) => c.isRemedial),
  };

  const recommendations = rules.flatMap((rule) => rule.apply(context));

  const unique = new Map();
  recommendations.forEach((r) => unique.set(r.courseId, r));

  return Array.from(unique.values());
};
