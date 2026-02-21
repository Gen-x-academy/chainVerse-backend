const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_1_tutor_account_settingsController } = require('./controller');

const issue_1_tutor_account_settingsRoute = createIssueRoute(express, issue_1_tutor_account_settingsController);

module.exports = { issue_1_tutor_account_settingsRoute };
