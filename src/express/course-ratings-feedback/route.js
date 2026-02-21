const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_10_course_ratings_feedbackController } = require('./controller');

const issue_10_course_ratings_feedbackRoute = createIssueRoute(express, issue_10_course_ratings_feedbackController);

module.exports = { issue_10_course_ratings_feedbackRoute };
