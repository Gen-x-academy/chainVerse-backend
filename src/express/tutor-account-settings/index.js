const { issue_1_tutor_account_settingsRoute } = require('./route');

const issue_1_tutor_account_settingsModule = {
  key: 'tutor-account-settings',
  basePath: '/tutor/account-settings',
  router: issue_1_tutor_account_settingsRoute,
};

module.exports = { issue_1_tutor_account_settingsModule };
