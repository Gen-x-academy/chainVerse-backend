const { createIssueController } = require('../../../common/create-issue-module');
const { issue_9_course_certification_nft_achievementsService } = require('./service');

const issue_9_course_certification_nft_achievementsController = createIssueController(issue_9_course_certification_nft_achievementsService);

module.exports = { issue_9_course_certification_nft_achievementsController };
