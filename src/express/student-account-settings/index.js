const { issue_2_student_account_settingsRoute } = require('./route');

const issue_2_student_account_settingsModule = {
  key: 'student-account-settings',
  basePath: '/student/account-settings',
  router: issue_2_student_account_settingsRoute,
};

module.exports = { issue_2_student_account_settingsModule };
