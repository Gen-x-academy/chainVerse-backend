const express = require('express');
const { createIssueRoute } = require('../../../common/create-issue-module');
const { issue_9_course_certification_nft_achievementsController } = require('./controller');

const issue_9_course_certification_nft_achievementsRoute = createIssueRoute(express, issue_9_course_certification_nft_achievementsController);

module.exports = { issue_9_course_certification_nft_achievementsRoute };
