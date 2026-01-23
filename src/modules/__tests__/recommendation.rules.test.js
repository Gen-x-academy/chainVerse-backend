const { rules } = require('../recommendation.rules');

describe('Recommendation Rules (Pure Functions)', () => {
  it('NEXT_COURSE_SEQUENCE recommends next course', () => {
    const rule = rules.find(r => r.name === 'NEXT_COURSE_SEQUENCE');

    const result = rule.apply({
      completedCourses: [{ _id: 'A', title: 'Intro' }],
      allCourses: [{ _id: 'B', title: 'Advanced', prerequisite: 'A' }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].courseId).toBe('B');
  });

  it('BEGINNER_TO_INTERMEDIATE suggests progression', () => {
    const rule = rules.find(r => r.name === 'BEGINNER_TO_INTERMEDIATE');

    const result = rule.apply({
      completedCourses: [
        { level: 'beginner' },
        { level: 'beginner' },
        { level: 'beginner' },
        { level: 'beginner' },
        { level: 'beginner' },
      ],
      allCourses: [{ _id: 'C', title: 'Intermediate Path', level: 'intermediate' }],
    });

    expect(result.length).toBeGreaterThan(0);
  });
});
