
exports.rules = [
  {
    name: 'NEXT_COURSE_SEQUENCE',
    apply: ({ completedCourses, allCourses }) => {
      const recommendations = [];

      completedCourses.forEach(course => {
        const next = allCourses.find(
          c => c.prerequisite === course._id
        );
        if (next) {
          recommendations.push({
            courseId: next._id,
            title: next.title,
            reason: `Based on your completion of ${course.title}`,
          });
        }
      });

      return recommendations;
    },
  },

  {
    name: 'LOW_QUIZ_SCORE_REMEDIAL',
    apply: ({ quizResults, remedialCourses }) => {
      const weakAreas = quizResults.filter(q => q.score < 50);

      return weakAreas.map(q => {
        const remedial = remedialCourses.find(
          c => c.skill === q.skill
        );
        if (!remedial) return null;

        return {
          courseId: remedial._id,
          title: remedial.title,
          reason: `Recommended to strengthen your understanding of ${q.skill}`,
        };
      }).filter(Boolean);
    },
  },

  {
    name: 'BEGINNER_TO_INTERMEDIATE',
    apply: ({ completedCourses, allCourses }) => {
      const beginnerCompleted = completedCourses.filter(
        c => c.level === 'beginner'
      );

      if (beginnerCompleted.length / completedCourses.length >= 0.8) {
        return allCourses
          .filter(c => c.level === 'intermediate')
          .map(c => ({
            courseId: c._id,
            title: c.title,
            reason: 'You are ready to move to an intermediate learning path',
          }));
      }

      return [];
    },
  },
];
