const { TutorReport } = require('../models/tutors');
const { Tutor } = require('../models/tutors');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { roleMiddleware } = require('../middlewares/roleMiddleware');
const { Course } = require('../models/course'); // Added Course model
const mongoose = require('mongoose');
const redis = require('redis');
const json2csv = require('json2csv').Parser;

const redisClient = redis.createClient({
	url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

const getCachedData = (key) =>
	new Promise((resolve) => {
		redisClient.get(key, (err, data) => {
			if (err) resolve(null);
			try {
				resolve(JSON.parse(data));
			} catch {
				resolve(null);
			}
		});
	});

const cacheResponse = (key, data, ttl = 3600) => {
	cache.setex(key, ttl, JSON.stringify(data));
};

const getTutorCoursesReport = async (req, res) => {
	try {
		const tutorId = req.user._id;
		const { interval } = req.query;

		// Validate interval
		const validIntervals = ['weekly', 'monthly', 'quarterly', 'yearly'];
		if (!validIntervals.includes(interval)) {
			return res.status(400).json({ error: 'Invalid reporting interval' });
		}

		// TODO: Implement aggregation logic
		const reportData = await aggregateCourseMetrics(tutorId, interval);

		res.json({
			success: true,
			interval,
			data: reportData,
		});
	} catch (error) {
		console.error('Report generation error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
};

const aggregateCourseMetrics = async (tutorId, interval) => {
	const dateFilter = {
		$match: {
			tutor: mongoose.Types.ObjectId(tutorId),
			createdAt: { $exists: true },
		},
	};

	const intervalMap = {
		weekly: { weeks: 1 },
		monthly: { months: 1 },
		quarterly: { months: 3 },
		yearly: { years: 1 },
	};

	const groupByInterval = {
		$group: {
			_id: {
				$dateTrunc: {
					date: '$createdAt',
					unit: intervalMap[interval],
				},
			},
			totalEnrollments: { $sum: '$enrollmentCount' },
			totalPurchases: { $sum: '$purchaseCount' },
			averageRating: { $avg: '$rating' },
			totalRevenue: { $sum: '$price' },
			engagement: {
				$avg: {
					$divide: ['$completedLessons', '$totalLessons'],
				},
			},
		},
	};

	const projectStage = {
		$project: {
			_id: 0,
			period: '$_id',
			totalEnrollments: 1,
			totalPurchases: 1,
			averageRating: { $round: ['$averageRating', 1] },
			engagementMetrics: {
				completionRate: { $multiply: ['$engagement', 100] },
			},
			revenueSummary: '$totalRevenue',
		},
	};

	const results = await Course.aggregate([
		dateFilter,
		groupByInterval,
		projectStage,
		{ $sort: { period: 1 } },
	]);

	return results;
};

const getCourseLeaderboard = async (req, res) => {
	try {
		const { metric = 'purchases', limit = 10 } = req.query;
		const cacheKey = `leaderboard:${metric}:${limit}`;

		// Try to get from cache first
		const cachedData = await getCachedData(cacheKey);
		if (cachedData) {
			return res.json(cachedData);
		}

		const pipeline = createLeaderboardPipeline(metric, parseInt(limit));
		const results = await Course.aggregate(pipeline);

		// Cache the results
		await redisClient.setEx(cacheKey, 3600, JSON.stringify(results));

		res.json(results);
	} catch (error) {
		console.error('Leaderboard generation error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
};

const getCourseReport = async (req, res) => {
	try {
		const courseId = req.params.id;
		const tutorId = req.user._id;
		const { format } = req.query;

		// Verify course belongs to tutor
		const course = await Course.findOne({ _id: courseId, tutor: tutorId });
		if (!course) {
			return res.status(404).json({ error: 'Course not found' });
		}

		const report = await Course.aggregate([
			{ $match: { _id: new mongoose.Types.ObjectId(courseId) } },
			{
				$lookup: {
					from: 'enrollments',
					localField: '_id',
					foreignField: 'courseId',
					as: 'enrollmentDetails',
				},
			},
			{
				$project: {
					title: 1,
					description: 1,
					price: 1,
					rating: { $ifNull: ['$rating', 0] },
					totalEnrollments: { $size: '$enrollmentDetails' },
					completionRate: {
						$multiply: [
							{
								$divide: [
									{
										$size: {
											$filter: {
												input: '$enrollmentDetails',
												as: 'e',
												cond: { $eq: ['$$e.status', 'completed'] },
											},
										},
									},
									{ $size: '$enrollmentDetails' },
								],
							},
							100,
						],
					},
					revenue: {
						$multiply: [
							{
								$size: {
									$filter: {
										input: '$enrollmentDetails',
										as: 'e',
										cond: { $eq: ['$$e.paymentStatus', 'paid'] },
									},
								},
							},
							'$price',
						],
					},
				},
			},
		]);

		if (format === 'csv') {
			const fields = [
				'title',
				'description',
				'price',
				'rating',
				'totalEnrollments',
				'completionRate',
				'revenue',
			];
			const json2csvParser = new json2csv({ fields });
			const csv = json2csvParser.parse(report[0]);

			res.header('Content-Type', 'text/csv');
			res.attachment(`course-report-${courseId}.csv`);
			return res.send(csv);
		}

		res.json(report[0]);
	} catch (error) {
		console.error('Course report generation error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
};

const createLeaderboardPipeline = (metric, limit) => {
	const metricMap = {
		purchases: { $sum: '$purchaseCount' },
		ratings: { $avg: '$rating' },
		enrollments: { $sum: '$enrollmentCount' },
		engagement: {
			$avg: {
				$divide: ['$completedLessons', '$totalLessons'],
			},
		},
	};

	return [
		{ $match: { status: 'Published' } },
		{
			$group: {
				_id: '$tutor',
				courseTitle: { $first: '$title' },
				metricValue: metricMap[metric],
				tutorName: { $first: '$tutor.name' },
			},
		},
		{ $sort: { metricValue: -1 } },
		{ $limit: limit },
		{
			$project: {
				_id: 0,
				courseId: '$_id',
				courseTitle: 1,
				tutorName: 1,
				[metric]: {
					$round: ['$metricValue', metric === 'ratings' ? 1 : 0],
				},
			},
		},
	];
};

const getTutorRankings = async (req, res) => {
	try {
		const cacheKey = 'tutor-rankings';
		const cachedData = await getCachedData(cacheKey);

		if (cachedData) {
			return res.json(cachedData);
		}

		const rankings = await Course.aggregate([
			{ $match: { status: 'published' } },
			{
				$group: {
					_id: '$tutor',
					totalSales: { $sum: '$purchaseCount' },
					totalEnrollments: { $sum: '$enrollmentCount' },
					averageRating: { $avg: '$rating' },
					courseCount: { $sum: 1 },
					totalRevenue: {
						$sum: { $multiply: ['$price', '$purchaseCount'] },
					},
					completionRate: {
						$avg: {
							$divide: [
								{
									$size: {
										$filter: {
											input: '$enrollments',
											as: 'e',
											cond: { $eq: ['$$e.status', 'completed'] },
										},
									},
								},
								{ $size: '$enrollments' },
							],
						},
					},
				},
			},
			{
				$lookup: {
					from: 'tutors',
					localField: '_id',
					foreignField: '_id',
					as: 'tutorInfo',
				},
			},
			{ $unwind: '$tutorInfo' },
			{
				$project: {
					_id: 1,
					tutorName: {
						$concat: ['$tutorInfo.firstName', ' ', '$tutorInfo.lastName'],
					},
					totalSales: 1,
					totalEnrollments: 1,
					averageRating: 1,
					courseCount: 1,
					totalRevenue: 1,
					completionRate: 1,
					// Calculate overall score for Hall of Fame
					overallScore: {
						$add: [
							{ $multiply: ['$totalSales', 0.3] },
							{ $multiply: ['$averageRating', 0.3] },
							{ $multiply: ['$completionRate', 0.4] },
						],
					},
				},
			},
			{ $sort: { overallScore: -1 } },
			{
				$facet: {
					rankings: [{ $skip: 0 }, { $limit: 100 }],
					hallOfFame: [
						{ $match: { overallScore: { $gte: 8.5 } } },
						{ $limit: 10 },
					],
				},
			},
		]);

		const result = rankings[0];
		await redisClient.setEx(cacheKey, 3600, JSON.stringify(result));

		res.json(result);
	} catch (error) {
		console.error('Tutor rankings generation error:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
};

module.exports = {
	getTutorCoursesReport,
	getCourseReport,
	getCourseLeaderboard,
	getTutorRankings,
};
