// filepath: src/controllers/adminFinancialAidController.js

const FinancialAid = require('../models/financialAid');
const { validationResult } = require('express-validator');
const { notificationService } = require('../utils/notificationService');
const { logAudit } = require('../utils/auditLogger'); // hypothetical audit logger

// Retrieve all financial aid applications with filtering
exports.getAllApplications = async (req, res) => {
	try {
		const { status, courseId } = req.query;
		const filter = {};

		if (status) filter.status = status;
		if (courseId) filter.courseId = courseId;

		const applications = await FinancialAid.find(filter)
			.populate('courseId', 'title description price')
			.populate('userId', 'name email') // Student info
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

// Retrieve a single financial aid application by ID
exports.getApplicationById = async (req, res) => {
	try {
		const { id } = req.params;
		const application = await FinancialAid.findById(id)
			.populate('courseId', 'title description price')
			.populate('userId', 'name email')
			.populate('documents'); // if applicable

		if (!application) {
			return res.status(404).json({ message: 'Application not found' });
		}

		res.json(application);
	} catch (error) {
		console.error('Error retrieving financial aid application:', error);
		res.status(500).json({ message: 'Server error', errors: error });
	}
};

// Review and respond to a financial aid application
exports.reviewApplication = async (req, res) => {
	try {
		const { id } = req.params;
		const { status, feedback } = req.body;
		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}

		// Validate enum manually if needed
		if (!['Approved', 'Denied'].includes(status)) {
			return res
				.status(400)
				.json({ message: 'Invalid status value. Must be Approved or Denied.' });
		}

		const application = await FinancialAid.findById(id);

		if (!application) {
			return res.status(404).json({ message: 'Application not found' });
		}

		// Immutability check: don't allow updates if already decided
		if (['Approved', 'Denied'].includes(application.status)) {
			return res
				.status(400)
				.json({
					message: `Application already ${application.status}. Decision cannot be changed.`,
				});
		}

		// Apply decision
		application.status = status;
		application.feedback = feedback || '';
		await application.save();

		// Notify user
		await notificationService.sendApplicationDecisionNotification(
			application.userId,
			application
		);

		// Audit log
		await logAudit(
			req.user._id,
			`Reviewed application ${id} with status: ${status}`
		);

		res.json({
			message: `Application ${status.toLowerCase()} successfully.`,
			application,
		});
	} catch (error) {
		console.error('Error reviewing financial aid application:', error);
		res.status(500).json({ message: 'Server error', errors: error });
	}
};

// Delete a financial aid application
exports.deleteApplication = async (req, res) => {
	try {
		const { id } = req.params;
		const application = await FinancialAid.findByIdAndDelete(id);

		if (!application) {
			return res.status(404).json({ message: 'Application not found' });
		}

		res.status(200).json({ message: 'Application deleted successfully' });
	} catch (error) {
		console.error('Error deleting financial aid application:', error);
		res.status(500).json({ message: 'Server error', errors: error });
	}
};
