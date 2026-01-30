const Certificate = require('../models/certificate');
const Course = require('../models/course');
const Student = require('../models/student');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');

const generateDownloadToken = (certificateId) => {
	const timestamp = Date.now();
	const data = `${certificateId}${timestamp}`;
	return createHash('sha256').update(data).digest('hex').substring(0, 32);
};

const verifyCertificateOwnership = async (certificateId, studentId) => {
	if (!certificateId || !studentId) {
		throw new Error('Certificate ID and Student ID are required');
	}

	const certificate = await Certificate.findOne({
		_id: certificateId,
		studentId: studentId,
	}).lean();

	return !!certificate;
};

const getMyCertificates = async (
	studentId,
	filters = {},
	pagination = {}
) => {
	try {
		if (!studentId) {
			throw new Error('Student ID is required');
		}

		// Build query
		const query = { studentId };

		// Apply filters
		if (filters.courseId) {
			query.courseId = filters.courseId;
		}

		if (filters.status) {
			query.status = filters.status;
		} else {
			query.status = 'ACTIVE';
		}

		if (filters.startDate || filters.endDate) {
			query.issueDate = {};
			if (filters.startDate) {
				query.issueDate.$gte = new Date(filters.startDate);
			}
			if (filters.endDate) {
				query.issueDate.$lte = new Date(filters.endDate);
			}
		}

		const page = Math.max(1, parseInt(pagination.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 10));
		const skip = (page - 1) * limit;

		const [certificates, totalCount] = await Promise.all([
			Certificate.find(query)
				.populate('courseId', 'title description tutorName')
				.populate('tutorId', 'name email')
				.sort({ issueDate: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
			Certificate.countDocuments(query),
		]);

		const certificatesWithTokens = certificates.map((cert) => ({
			...cert,
			downloadToken: generateDownloadToken(cert._id.toString()),
			downloadTokenExpiry: Date.now() + 3600000,
		}));

		const totalPages = Math.ceil(totalCount / limit);

		return {
			success: true,
			data: certificatesWithTokens,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages,
				hasNextPage: page < totalPages,
				hasPrevPage: page > 1,
			},
			message: certificatesWithTokens.length > 0
				? `Retrieved ${certificatesWithTokens.length} certificate(s)`
				: 'No certificates found',
		};
};

const getSingleCertificate = async (certificateId, studentId) => {
	if (!certificateId || !studentId) {
		throw new Error('Certificate ID and Student ID are required');
	}

	const certificate = await Certificate.findById(certificateId)
			.populate('courseId', 'title description tutorName duration category')
			.populate('tutorId', 'name email profileImage')
			.populate('studentId', 'name email')
			.lean();

		if (!certificate) {
			throw new Error('Certificate not found');
		}

	if (certificate.studentId._id.toString() !== studentId.toString()) {
		throw new Error('Unauthorized access to certificate');
	}

	if (certificate.status && certificate.status !== 'ACTIVE') {
		logger.warn(`Non-active certificate access attempt`, {
			certificateId,
			status: certificate.status,
		});
	}

	return {
		success: true,
		data: {
			...certificate,
			downloadToken: generateDownloadToken(certificateId),
			downloadTokenExpiry: Date.now() + 3600000,
		},
		message: 'Certificate retrieved successfully',
	};
 */
const getCertificateFilesForDownload = async (studentId) => {
	try {
		if (!studentId) {
			throw new Error('Student ID is required');
		}

		// Get all active certificates for the student
		const certificates = await Certificate.find({
			studentId,
			status: 'ACTIVE',
		})
			.populate('courseId', 'title')
			.lean();

		if (!certificates || certificates.length === 0) {
			return {
				success: true,
				data: [],
				message: 'No certificates found for download',
			};
		}

	const certificateFiles = certificates
		.filter((cert) => cert.certificateUrl || cert.imageUrl)
		.map((cert) => {
			const courseTitle = cert.courseId?.title || 'Unknown_Course';
			const sanitizedTitle = courseTitle.replace(/[^a-z0-9]/gi, '_');
			const certificateId = cert._id.toString().substring(0, 8);
			const fileUrl = cert.certificateUrl || cert.imageUrl;
			const fileExtension = cert.certificateUrl ? 'pdf' : 'png';

			return {
				url: fileUrl,
				filename: `${sanitizedTitle}_${certificateId}.${fileExtension}`,
				certificateId: cert._id.toString(),
				courseTitle: cert.courseId?.title || 'Unknown Course',
				issueDate: cert.issueDate,
			};
		});

	return {
		success: true,
		data: certificateFiles,
		count: certificateFiles.length,
		message: `${certificateFiles.length} certificate(s) ready for download`,
	};
			throw new Error('Student ID is required');
		}

		const [totalCertificates, activeCertificates, recentCertificates] =
			await Promise.all([
				Certificate.countDocuments({ studentId }),
				Certificate.countDocuments({ studentId, status: 'ACTIVE' }),
				Certificate.find({ studentId })
					.sort({ issueDate: -1 })
					.limit(5)
					.populate('courseId', 'title')
					.lean(),
			]);

		return {
			success: true,
			data: {
				totalCertificates,
				activeCertificates,
				revokedCertificates: totalCertificates - activeCertificates,
				recentCertificates,
			},
			message: 'Certificate statistics retrieved successfully',
		};
	} catch (error) {
		logger.error(
			`Error retrieving certificate statistics: ${error.message}`,
			{
				studentId,
			}
		);
		throw new Error(
			`Failed to retrieve certificate statistics: ${error.message}`
		);
	}
};

module.exports = {
	getMyCertificates,
	getSingleCertificate,
	getCertificateFilesForDownload,
	verifyCertificateOwnership,
	getCertificateStatistics,
	generateDownloadToken,
};
