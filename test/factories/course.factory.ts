export interface CourseFields {
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  thumbnailUrl: string;
  tutorId: string;
  tutorEmail: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'unpublished';
  enrolledStudents: string[];
}

let counter = 0;

/**
 * Builds a plain Course document object with sensible defaults.
 *
 * @example
 * // Published free course
 * const course = buildCourse({ status: 'published', price: 0 });
 *
 * // Course with enrolled students
 * const course = buildCourse({ enrolledStudents: ['student-id-1'] });
 */
export function buildCourse(overrides: Partial<CourseFields> = {}): CourseFields {
  counter += 1;
  return {
    title: `Test Course ${counter}`,
    description: `Description for test course ${counter}`,
    category: 'Technology',
    tags: ['test'],
    price: 9.99,
    thumbnailUrl: `https://placehold.co/600x400?text=Course+${counter}`,
    tutorId: 'factory-tutor-id',
    tutorEmail: 'tutor@factory.test',
    status: 'published',
    enrolledStudents: [],
    ...overrides,
  };
}

/** Resets the internal counter. Call in afterEach/afterAll if you need stable titles. */
export function resetCourseCounter(): void {
  counter = 0;
}
