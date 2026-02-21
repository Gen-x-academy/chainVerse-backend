const { createIssueController } = require('../../../common/create-issue-module');
const { issue_2_student_account_settingsService } = require('./service');

const issue_2_student_account_settingsController = createIssueController(issue_2_student_account_settingsService);

module.exports = { issue_2_student_account_settingsController };
