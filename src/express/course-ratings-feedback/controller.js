const { createIssueController } = require('../../../common/create-issue-module');
const { issue_10_course_ratings_feedbackService } = require('./service');

const issue_10_course_ratings_feedbackController = createIssueController(issue_10_course_ratings_feedbackService);

module.exports = { issue_10_course_ratings_feedbackController };
