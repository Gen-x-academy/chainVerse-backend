const CourseRating = require('../models/courseRating');
const Course = require('../models/course');
const { ratingSchema } = require('../validators/ratingValidator');
const mongoose = require('mongoose');

/**
 * @desc    Submit a new rating for a course
 * @route   POST /api/courses/:id/rate
 * @access  Private (Student only)
 */
exports.submitRating = async (req, res) => {
	const { id } = req.params;
	const studentId = req.user._id;

	try {
		// Validate input
		await ratingSchema.validateAsync(req.body);
		const { rating, feedback, suggestions } = req.body;

		// Check if course exists
		const course = await Course.findById(id);
		if (!course) {
			return res.status(404).json({
				status: 'fail',
				message: 'Course not found',
			});
		}

		// Check if student is enrolled in the course
		const isEnrolled = await Course.findOne({
			_id: id,
			'enrollments.studentId': studentId,
		});

		if (!isEnrolled) {
			return res.status(403).json({
				status: 'fail',
				message: 'You must be enrolled in this course to rate it',
			});
		}

		// Check if student has already rated this course
		const existingRating = await CourseRating.findOne({
			courseId: id,
			studentId,
		});
		if (existingRating) {
			return res.status(400).json({
				status: 'fail',
				message:
					'You have already rated this course. Use PUT to update your rating.',
			});
		}

		// Start a transaction
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			// Create new rating
			const newRating = await CourseRating.create(
				[
					{
						courseId: id,
						studentId,
						rating,
						feedback,
						suggestions,
					},
				],
				{ session }
			);

			// Update course average rating
			const allRatings = await CourseRating.find({ courseId: id });
			const ratingSum = allRatings.reduce((sum, item) => sum + item.rating, 0);
			const ratingCount = allRatings.length;
			const averageRating = ratingSum / ratingCount;

			await Course.findByIdAndUpdate(
				id,
				{
					averageRating,
					ratingCount,
				},
				{ session }
			);

			await session.commitTransaction();
			session.endSession();

			return res.status(201).json({
				status: 'success',
				message: 'Rating submitted successfully',
				data: newRating[0],
			});
		} catch (error) {
			await session.abortTransaction();
			session.endSession();
			throw error;
		}
	} catch (error) {
		const statusCode = error.details ? 400 : 500;
		const message = error.details
			? error.details[0].message
			: 'Something went wrong';
		return res.status(statusCode).json({ status: 'fail', message });
	}
};

/**
 * @desc    Get all ratings for a course
 * @route   GET /api/courses/:id/ratings
 * @access  Private
 */
exports.getCourseRatings = async (req, res) => {
	const { id } = req.params;
	const { page = 1, limit = 10 } = req.query;

	try {
		// Check if course exists
		const course = await Course.findById(id);
		if (!course) {
			return res.status(404).json({
				status: 'fail',
				message: 'Course not found',
			});
		}

		const skip = (parseInt(page) - 1) * parseInt(limit);

		const ratings = await CourseRating.find({ courseId: id })
			.populate('studentId', 'name email')
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(parseInt(limit));

		const totalRatings = await CourseRating.countDocuments({ courseId: id });

		return res.status(200).json({
			status: 'success',
			data: {
				ratings,
				pagination: {
					total: totalRatings,
					page: parseInt(page),
					limit: parseInt(limit),
					pages: Math.ceil(totalRatings / parseInt(limit)),
				},
			},
		});
	} catch (error) {
		return res.status(500).json({
			status: 'fail',
			message: 'Something went wrong',
		});
	}
};

/**
 * @desc    Get current student's rating for a course
 * @route   GET /api/courses/:id/my-rating
 * @access  Private (Student only)
 */
exports.getMyRating = async (req, res) => {
	const { id } = req.params;
	const studentId = req.user._id;

	try {
		// Check if course exists
		const course = await Course.findById(id);
		if (!course) {
			return res.status(404).json({
				status: 'fail',
				message: 'Course not found',
			});
		}

		const rating = await CourseRating.findOne({ courseId: id, studentId });

		if (!rating) {
			return res.status(404).json({
				status: 'fail',
				message: 'You have not rated this course yet',
			});
		}

		return res.status(200).json({
			status: 'success',
			data: rating,
		});
	} catch (error) {
		return res.status(500).json({
			status: 'fail',
			message: 'Something went wrong',
		});
	}
};

/**
 * @desc    Update a rating for a course
 * @route   PUT /api/courses/:id/rate
 * @access  Private (Student only)
 */
exports.updateRating = async (req, res) => {
	const { id } = req.params;
	const studentId = req.user._id;

	try {
		// Validate input
		await ratingSchema.validateAsync(req.body);
		const { rating, feedback, suggestions } = req.body;

		// Check if course exists
		const course = await Course.findById(id);
		if (!course) {
			return res.status(404).json({
				status: 'fail',
				message: 'Course not found',
			});
		}

		// Check if student has rated this course
		const existingRating = await CourseRating.findOne({
			courseId: id,
			studentId,
		});
		if (!existingRating) {
			return res.status(404).json({
				status: 'fail',
				message: 'You have not rated this course yet',
			});
		}

		// Start a transaction
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			// Update rating
			const updatedRating = await CourseRating.findOneAndUpdate(
				{ courseId: id, studentId },
				{ rating, feedback, suggestions },
				{ new: true, session }
			);

			// Update course average rating
			const allRatings = await CourseRating.find({ courseId: id });
			const ratingSum = allRatings.reduce((sum, item) => sum + item.rating, 0);
			const ratingCount = allRatings.length;
			const averageRating = ratingSum / ratingCount;

			await Course.findByIdAndUpdate(
				id,
				{
					averageRating,
					ratingCount,
				},
				{ session }
			);

			await session.commitTransaction();
			session.endSession();

			return res.status(200).json({
				status: 'success',
				message: 'Rating updated successfully',
				data: updatedRating,
			});
		} catch (error) {
			await session.abortTransaction();
			session.endSession();
			throw error;
		}
	} catch (error) {
		const statusCode = error.details ? 400 : 500;
		const message = error.details
			? error.details[0].message
			: 'Something went wrong';
		return res.status(statusCode).json({ status: 'fail', message });
	}
};

/**
 * @desc    Delete a rating for a course
 * @route   DELETE /api/courses/:id/rate
 * @access  Private (Student only)
 */
exports.deleteRating = async (req, res) => {
	const { id } = req.params;
	const studentId = req.user._id;

	try {
		// Check if course exists
		const course = await Course.findById(id);
		if (!course) {
			return res.status(404).json({
				status: 'fail',
				message: 'Course not found',
			});
		}

		// Check if student has rated this course
		const existingRating = await CourseRating.findOne({
			courseId: id,
			studentId,
		});
		if (!existingRating) {
			return res.status(404).json({
				status: 'fail',
				message: 'You have not rated this course yet',
			});
		}

		// Start a transaction
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			// Delete rating
			await CourseRating.findOneAndDelete(
				{ courseId: id, studentId },
				{ session }
			);

			// Update course average rating
			const allRatings = await CourseRating.find({ courseId: id });
			const ratingCount = allRatings.length;

			if (ratingCount === 0) {
				await Course.findByIdAndUpdate(
					id,
					{
						averageRating: 0,
						ratingCount: 0,
					},
					{ session }
				);
			} else {
				const ratingSum = allRatings.reduce(
					(sum, item) => sum + item.rating,
					0
				);
				const averageRating = ratingSum / ratingCount;

				await Course.findByIdAndUpdate(
					id,
					{
						averageRating,
						ratingCount,
					},
					{ session }
				);
			}

			await session.commitTransaction();
			session.endSession();

			return res.status(200).json({
				status: 'success',
				message: 'Rating deleted successfully',
			});
		} catch (error) {
			await session.abortTransaction();
			session.endSession();
			throw error;
		}
	} catch (error) {
		return res.status(500).json({
			status: 'fail',
			message: 'Something went wrong',
		});
	}
};
