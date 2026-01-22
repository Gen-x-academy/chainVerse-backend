const ReportAbuse = require('../models/reportAbuse');

exports.submitReport = async (req, res) => {
	try {
		const { contentId, contentType, reason, description } = req.body;

		const reportedBy = req.user._id;

		const newReport = new ReportAbuse({
			contentId,
			contentType,
			reason,
			description,
			reportedBy,
			status: 'Pending',
		});

		await newReport.save();

		return res
			.status(201)
			.json({ message: 'Report abuse created successfully.' });
	} catch (error) {
		console.error('Error creating report abuse:', error);
		return res.status(500).json({ message: 'Internal server error.' });
	}
};

exports.getReports = async (req, res) => {
	try {
		const { status, contentType } = req.query;

		let query = {};
		if (status) {
			query.status = status;
		}
		if (contentType) {
			query.contentType = contentType;
		}

		const reports = await ReportAbuse.find(query)
			.populate('reportedBy', 'fullName email')
			.sort({ createdAt: -1 });
		return res.status(200).json(reports);
	} catch (error) {
		console.error('Error fetching reports:', error);
		return res.status(500).json({ message: 'Internal server error.' });
	}
};

exports.updateReportStatus = async (req, res) => {
	try {
		const { reportId } = req.params;
		const { status, adminNote } = req.body;

		if (!status) {
			return res.status(400).json({ message: 'Status is required.' });
		}

		if (!['Resolved', 'Dismissed'].includes(status)) {
			return res
				.status(400)
				.json({
					message: 'Invalid status. Must be either "Resolved" or "Dismissed".',
				});
		}

		const report = await ReportAbuse.findById(reportId);

		if (!report) {
			return res.status(404).json({ message: 'Report not found.' });
		}

		report.status = status;
		report.adminNote = adminNote || report.adminNote;

		await report.save();

		return res
			.status(200)
			.json({ message: 'Report status updated successfully.' });
	} catch (error) {
		console.error('Error updating report status:', error);
		return res.status(500).json({ message: 'Internal server error.' });
	}
};
