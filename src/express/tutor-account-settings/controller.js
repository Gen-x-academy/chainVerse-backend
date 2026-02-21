const { createIssueController } = require('../../../common/create-issue-module');
const { issue_1_tutor_account_settingsService } = require('../service');

const issue_1_tutor_account_settingsController = createIssueController(issue_1_tutor_account_settingsService);

module.exports = { issue_1_tutor_account_settingsController };
