const FinancialAid = require('../models/financialAid');
const Course = require('../models/course');
const { validationResult } = require('express-validator');

// Apply for financial aid
exports.applyForFinancialAid = async (req, res) => {
	try {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}

		const { courseId, reason, incomeStatus } = req.body;
		const userId = req.user._id;

		// Check if course exists
		const course = await Course.findById(courseId);
		if (!course) {
			return res.status(404).json({ message: 'Course not found' });
		}

		// Check if user already has an application for this course
		const existingApplication = await FinancialAid.findOne({
			userId,
			courseId,
		});

		if (existingApplication) {
			return res.status(400).json({
				message: 'You already have an application for this course',
			});
		}

		// Create new financial aid application
		const financialAid = new FinancialAid({
			userId,
			courseId,
			reason,
			incomeStatus,
		});

		await financialAid.save();

		res.status(201).json({
			message: 'Financial aid application submitted successfully',
			application: {
				id: financialAid._id,
				courseId: financialAid.courseId,
				status: financialAid.status,
				createdAt: financialAid.createdAt,
			},
		});
	} catch (error) {
		console.error('Error applying for financial aid:', error);
		res.status(500).json({ message: 'Server error', errors: error });
	}
};

// Get user's own applications
exports.getMyApplications = async (req, res) => {
	try {
		const userId = req.user._id;
		const { status } = req.query;

		// Build query filters
		const filters = { userId };
		if (status) {
			filters.status = status;
		}

		const applications = await FinancialAid.find(filters)
			.populate('courseId', 'title description price')
			.sort({ createdAt: -1 });

		res.json({
			count: applications.length,
			applications,
		});
	} catch (error) {
		console.error('Error retrieving financial aid applications:', error);
		res.status(500).json({ message: 'Server error', errors: error });
	}
};
