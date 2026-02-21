const { issue_8_gamification_points_systemRoute } = require('./route');

const issue_8_gamification_points_systemModule = {
  key: 'gamification-points-system',
  basePath: '/gamification/points',
  router: issue_8_gamification_points_systemRoute,
};

module.exports = { issue_8_gamification_points_systemModule };
