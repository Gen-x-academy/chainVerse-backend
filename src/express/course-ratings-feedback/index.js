const { issue_10_course_ratings_feedbackRoute } = require('./route');

const issue_10_course_ratings_feedbackModule = {
  key: 'course-ratings-feedback',
  basePath: '/courses/ratings-feedback',
  router: issue_10_course_ratings_feedbackRoute,
};

module.exports = { issue_10_course_ratings_feedbackModule };
