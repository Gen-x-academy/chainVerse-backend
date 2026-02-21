const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_3_admin_moderator_account_settingsController } = require('./controller');

const issue_3_admin_moderator_account_settingsRoute = createIssueRoute(express, issue_3_admin_moderator_account_settingsController);

module.exports = { issue_3_admin_moderator_account_settingsRoute };
