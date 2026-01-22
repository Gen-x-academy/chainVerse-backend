const RecommendationService = require('../services/recommendation.service');

/**
 * Get recommended courses for the authenticated user
 */
const getRecommendedCourses = async (req, res) => {
	const userId = req.user._id; // Extracted from JWT by auth middleware
	const recommendations = await RecommendationService.getRecommendedCourses(
		userId
	);

	res.status(200).json({
		status: 'success',
		data: {
			recommendations,
		},
	});
};

module.exports = {
	getRecommendedCourses,
};
