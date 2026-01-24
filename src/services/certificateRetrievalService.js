const Certificate = require('../models/certificate');
const Course = require('../models/course');
const Student = require('../models/student');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');

/**
 * Certificate Retrieval Service
 * Handles all business logic for retrieving and managing student certificates
 */

/**
 * Generate a short-lived download token for certificate access
 * @param {string} certificateId - The certificate ID
 * @returns {string} Download token
 */
const generateDownloadToken = (certificateId) => {
	const timestamp = Date.now();
	const data = `${certificateId}${timestamp}`;
	return createHash('sha256').update(data).digest('hex').substring(0, 32);
};

/**
 * Verify certificate ownership
 * @param {string} certificateId - The certificate ID
 * @param {string} studentId - The student ID
 * @returns {Promise<boolean>} True if student owns the certificate
 * @throws {Error} If validation fails
 */
const verifyCertificateOwnership = async (certificateId, studentId) => {
	try {
		if (!certificateId || !studentId) {
			throw new Error('Certificate ID and Student ID are required');
		}

		const certificate = await Certificate.findOne({
			_id: certificateId,
			studentId: studentId,
		}).lean();

		return !!certificate;
	} catch (error) {
		logger.error(
			`Error verifying certificate ownership: ${error.message}`,
			{
				certificateId,
				studentId,
			}
		);
		throw new Error('Failed to verify certificate ownership');
	}
};

/**
 * Get all certificates for a student with filters and pagination
 * @param {string} studentId - The student ID
 * @param {Object} filters - Filter options
 * @param {string} [filters.courseId] - Filter by course ID
 * @param {string} [filters.startDate] - Filter by start date (ISO string)
 * @param {string} [filters.endDate] - Filter by end date (ISO string)
 * @param {string} [filters.status] - Filter by status (ACTIVE, REVOKED, etc.)
 * @param {Object} pagination - Pagination options
 * @param {number} [pagination.page=1] - Page number
 * @param {number} [pagination.limit=10] - Items per page
 * @returns {Promise<Object>} Paginated certificates with metadata
 * @throws {Error} If retrieval fails
 */
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
			// Default to active certificates only
			query.status = 'ACTIVE';
		}

		// Date range filter
		if (filters.startDate || filters.endDate) {
			query.issueDate = {};
			if (filters.startDate) {
				query.issueDate.$gte = new Date(filters.startDate);
			}
			if (filters.endDate) {
				query.issueDate.$lte = new Date(filters.endDate);
			}
		}

		// Pagination setup
		const page = Math.max(1, parseInt(pagination.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 10));
		const skip = (page - 1) * limit;

		// Execute query with pagination
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

		// Add download tokens to each certificate
		const certificatesWithTokens = certificates.map((cert) => ({
			...cert,
			downloadToken: generateDownloadToken(cert._id.toString()),
			downloadTokenExpiry: Date.now() + 3600000, // 1 hour
		}));

		// Calculate pagination metadata
		const totalPages = Math.ceil(totalCount / limit);
		const hasNextPage = page < totalPages;
		const hasPrevPage = page > 1;

		return {
			success: true,
			data: certificatesWithTokens,
			pagination: {
				page,
				limit,
				totalCount,
				totalPages,
				hasNextPage,
				hasPrevPage,
			},
			message:
				certificatesWithTokens.length > 0
					? `Retrieved ${certificatesWithTokens.length} certificate(s)`
					: 'No certificates found',
		};
	} catch (error) {
		logger.error(`Error retrieving certificates: ${error.message}`, {
			studentId,
			filters,
			pagination,
		});
		throw new Error(`Failed to retrieve certificates: ${error.message}`);
	}
};

/**
 * Get a single certificate by ID with ownership verification
 * @param {string} certificateId - The certificate ID
 * @param {string} studentId - The student ID
 * @returns {Promise<Object>} Certificate details with download token
 * @throws {Error} If certificate not found or access denied
 */
const getSingleCertificate = async (certificateId, studentId) => {
	try {
		if (!certificateId || !studentId) {
			throw new Error('Certificate ID and Student ID are required');
		}

		// Find certificate with populated fields
		const certificate = await Certificate.findById(certificateId)
			.populate('courseId', 'title description tutorName duration category')
			.populate('tutorId', 'name email profileImage')
			.populate('studentId', 'name email')
			.lean();

		if (!certificate) {
			throw new Error('Certificate not found');
		}

		// Verify ownership
		if (certificate.studentId._id.toString() !== studentId.toString()) {
			throw new Error('Unauthorized access to certificate');
		}

		// Check if certificate is active
		if (certificate.status && certificate.status !== 'ACTIVE') {
			logger.warn(`Access attempt to non-active certificate`, {
				certificateId,
				status: certificate.status,
			});
		}

		// Add download token
		const certificateWithToken = {
			...certificate,
			downloadToken: generateDownloadToken(certificateId),
			downloadTokenExpiry: Date.now() + 3600000, // 1 hour
		};

		return {
			success: true,
			data: certificateWithToken,
			message: 'Certificate retrieved successfully',
		};
	} catch (error) {
		logger.error(`Error retrieving single certificate: ${error.message}`, {
			certificateId,
			studentId,
		});

		// Re-throw with appropriate error message
		if (
			error.message === 'Certificate not found' ||
			error.message === 'Unauthorized access to certificate'
		) {
			throw error;
		}
		throw new Error(`Failed to retrieve certificate: ${error.message}`);
	}
};

/**
 * Get all certificate file URLs for a student for ZIP download
 * @param {string} studentId - The student ID
 * @returns {Promise<Array>} Array of certificate file objects with url and filename
 * @throws {Error} If retrieval fails
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

		// Map certificates to file objects
		const certificateFiles = certificates
			.filter((cert) => cert.certificateUrl || cert.imageUrl) // Only include certs with file URLs
			.map((cert) => {
				const courseTitle = cert.courseId?.title || 'Unknown_Course';
				const sanitizedTitle = courseTitle.replace(/[^a-z0-9]/gi, '_');
				const certificateId = cert._id.toString().substring(0, 8);

				// Determine file URL and extension
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

		logger.info(`Prepared ${certificateFiles.length} certificates for download`, {
			studentId,
			totalCertificates: certificates.length,
			filesWithUrls: certificateFiles.length,
		});

		return {
			success: true,
			data: certificateFiles,
			count: certificateFiles.length,
			message: `${certificateFiles.length} certificate(s) ready for download`,
		};
	} catch (error) {
		logger.error(
			`Error retrieving certificate files for download: ${error.message}`,
			{
				studentId,
			}
		);
		throw new Error(
			`Failed to retrieve certificate files: ${error.message}`
		);
	}
};

/**
 * Get certificate statistics for a student
 * @param {string} studentId - The student ID
 * @returns {Promise<Object>} Certificate statistics
 * @throws {Error} If retrieval fails
 */
const getCertificateStatistics = async (studentId) => {
	try {
		if (!studentId) {
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
