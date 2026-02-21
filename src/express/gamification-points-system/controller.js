const { createIssueController } = require('../../../common/create-issue-module');
const { issue_8_gamification_points_systemService } = require('./service');

const issue_8_gamification_points_systemController = createIssueController(issue_8_gamification_points_systemService);

module.exports = { issue_8_gamification_points_systemController };
