const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_2_student_account_settingsController } = require('./controller');

const issue_2_student_account_settingsRoute = createIssueRoute(express, issue_2_student_account_settingsController);

module.exports = { issue_2_student_account_settingsRoute };
