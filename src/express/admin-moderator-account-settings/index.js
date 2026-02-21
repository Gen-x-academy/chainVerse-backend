const { issue_3_admin_moderator_account_settingsRoute } = require('./route');

const issue_3_admin_moderator_account_settingsModule = {
  key: 'admin-moderator-account-settings',
  basePath: '/admin-moderator/account-settings',
  router: issue_3_admin_moderator_account_settingsRoute,
};

module.exports = { issue_3_admin_moderator_account_settingsModule };
