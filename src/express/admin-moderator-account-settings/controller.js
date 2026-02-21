const { createIssueController } = require('../../../common/create-issue-module');
const { issue_3_admin_moderator_account_settingsService } = require('./service');

const issue_3_admin_moderator_account_settingsController = createIssueController(issue_3_admin_moderator_account_settingsService);

module.exports = { issue_3_admin_moderator_account_settingsController };
