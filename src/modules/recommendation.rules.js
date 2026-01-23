exports.rules = [
  {
    name: "NEXT_COURSE_SEQUENCE",
    apply: ({ completedCourses, allCourses }) => {
      const recommendations = [];

      completedCourses.forEach((course) => {
        const next = allCourses.find(
          (c) =>
            c.prerequisite &&
            c.prerequisite.toString() === course._id.toString(),
        );

        if (next) {
          recommendations.push({
            courseId: next._id.toString(),
            title: next.title,
            reason: `Based on your completion of ${course.title}`,
          });
        }
      });

      return recommendations;
    },
  },

  {
    name: "LOW_QUIZ_SCORE_REMEDIAL",
    apply: ({ quizResults, remedialCourses }) => {
      const weakAreas = quizResults.filter((q) => q.score < 50);
      const result = weakAreas
        .map((q) => {
          const remedial = remedialCourses.find((c) => c.skill === q.skill);
          if (!remedial) return null;

          return {
            courseId: remedial._id.toString(),
            title: remedial.title,
            reason: `Recommended to strengthen your understanding of ${q.skill}`,
          };
        })
        .filter(Boolean);

      return result;
    },
  },

  {
    name: "BEGINNER_TO_INTERMEDIATE",
    apply: ({ completedCourses, allCourses }) => {
      const beginnerCompleted = completedCourses.filter(
        (c) => c.level === "beginner",
      );

      if (beginnerCompleted.length / completedCourses.length >= 0.8) {
        const result = allCourses
          .filter((c) => c.level === "intermediate")
          .map((c) => ({
            courseId: c._id.toString(),
            title: c.title,
            reason: "You are ready to move to an intermediate learning path",
          }));

        return result;
      }

      return [];
    },
  },
];
