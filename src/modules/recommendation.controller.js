const { getNextCourseRecommendations } = require('./recommendation.service');
const { recommendationResponseSchema } = require('./recommendation.dto');

exports.getNextCourses = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const recommendations = await getNextCourseRecommendations(userId);

    const { error } = recommendationResponseSchema.validate({ recommendations });
    if (error) return res.status(500).json({ message: error.message });

    res.status(200).json({
      status: 'success',
      recommendations,
    });
  } catch (err) {
    next(err);
  }
};
