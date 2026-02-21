const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_5_course_performance_leaderboardController } = require('./controller');

const issue_5_course_performance_leaderboardRoute = createIssueRoute(express, issue_5_course_performance_leaderboardController);

module.exports = { issue_5_course_performance_leaderboardRoute };
