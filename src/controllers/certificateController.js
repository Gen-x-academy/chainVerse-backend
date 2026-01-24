const Certificate = require('../models/certificate-temp');
const Course = require('../models/course');
const Student = require('../models/student');
//const ShareAnalytics = require('../models/ShareAnalytics');
const QRCode = require('qrcode');
const { generatePDF } = require('../utils/pdfGenerator');
const { uploadToS3 } = require('../utils/s3Uploader');
const { generatePublicHash } = require('../utils/hashGenerator');
const { uploadToCloudStorage, getSignedUrl } = require('../utils/cloudStorage');
const { generateCertificateImage } = require('../utils/certificateGenerator');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');
const AdmZip = require('adm-zip');
const path = require('path');
const certificateRetrievalService = require('../services/certificateRetrievalService');
const zipGenerator = require('../utils/zipGenerator');
const {
	verifyDownloadToken,
	extractTokenFromRequest,
} = require('../utils/downloadTokenGenerator');

// Helper: Verify certificate ownership
const verifyCertificateOwnership = async (certificateId, userId) => {
	return await Certificate.findOne({
		_id: certificateId,
		studentId: userId,
		status: 'ACTIVE',
	});
};

// Generate verification hash
exports.generateVerificationHash = (certificate) => {
	const data = `${certificate.studentId}${certificate.courseId}${certificate.issueDate}${certificate.certificateNumber}`;
	return createHash('sha256').update(data).digest('hex');
};

// Complete a course and generate certificate
exports.completeCourse = async (req, res) => {
	try {
		const studentId = req.user._id;
		const courseId = req.params.id;
		const course = await Course.findById(courseId);
		if (!course) return res.status(404).json({ message: 'Course not found' });

		const verificationId = uuidv4();
		const qrData = `${process.env.BASE_URL}/verify/certificate/${verificationId}`;
		const qrCode = await QRCode.toDataURL(qrData);

		const pdfBuffer = await generatePDF({
			studentName: req.user.name,
			courseTitle: course.title,
			tutorName: course.tutorName,
			completionDate: new Date().toLocaleDateString(),
			qrCode,
			verificationId,
		});

		const pdfUrl = await uploadToS3(
			pdfBuffer,
			`certificates/${studentId}_${courseId}.pdf`
		);

		const cert = await Certificate.create({
			studentId,
			courseId,
			tutorName: course.tutorName,
			completionDate: new Date(),
			certificateUrl: pdfUrl,
			verificationId,
			status: 'ACTIVE',
		});

		res.status(201).json({ message: 'Course completed', certificate: cert });
	} catch (err) {
		console.error(err);
		res.status(500).json({ message: 'Error completing course' });
	}
};

// Get a student's certificate for a course
exports.getCertificate = async (req, res) => {
	try {
		const certificateId = req.params.certificateId || req.params.id;
		const userId = req.user._id;

		const certificate = await Certificate.findById(certificateId);
		if (!certificate)
			return res.status(404).json({ error: 'Certificate not found' });

		if (certificate.studentId.toString() !== userId.toString()) {
			return res
				.status(403)
				.json({ error: 'Unauthorized access to certificate' });
		}

		if (!certificate.imageUrl) {
			const certificateImage = await generateCertificateImage(certificate);
			const imageKey = `certificates/${certificate._id}/certificate.png`;
			const uploadResult = await uploadToCloudStorage(
				imageKey,
				certificateImage
			);
			certificate.imageUrl = uploadResult.url;
			await certificate.save();
		}

		return res.status(200).json(certificate);
	} catch (error) {
		logger.error(`Error retrieving certificate: ${error.message}`);
		res.status(500).json({ error: 'Failed to retrieve certificate' });
	}
};

// Get all certificates for a student
exports.getMyCertificates = async (req, res) => {
	try {
		const studentId = req.user._id || req.user.id;
		const filters = {
			courseId: req.query.courseId,
			startDate: req.query.issueDateStart || req.query.startDate,
			endDate: req.query.issueDateEnd || req.query.endDate,
			status: req.query.status,
		};
		const pagination = {
			page: req.query.page,
			limit: req.query.limit,
		};

		const result = await certificateRetrievalService.getMyCertificates(
			studentId,
			filters,
			pagination
		);

		return res.status(200).json(result);
	} catch (error) {
		logger.error(`Error in getMyCertificates: ${error.message}`);
		return res.status(500).json({
			success: false,
			message: 'Error retrieving certificates',
			error: error.message,
		});
	}
};

// Download all certificates as zip
exports.downloadAllCertificates = async (req, res) => {
	try {
		const studentId = req.user._id || req.user.id;

		const result = await certificateRetrievalService.getCertificateFilesForDownload(
			studentId
		);

		if (!result.success || result.data.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'No certificates found for download',
			});
		}

		const zipPath = await zipGenerator.getTempZipPath(studentId);
		await zipGenerator.createCertificateZip(result.data, zipPath);

		const filename = `certificates_${studentId}_${Date.now()}.zip`;
		await zipGenerator.streamZipToResponse(zipPath, res, filename);
	} catch (error) {
		logger.error(`Error in downloadAllCertificates: ${error.message}`);
		return res.status(500).json({
			success: false,
			message: 'Error downloading certificates',
			error: error.message,
		});
	}
};

// Generate a public link for a certificate
exports.generatePublicLink = async (req, res) => {
	try {
		const { certificateId } = req.params;
		const userId = req.user._id;

		const certificate = await Certificate.findById(certificateId);
		if (!certificate)
			return res.status(404).json({ error: 'Certificate not found' });

		if (certificate.studentId.toString() !== userId.toString()) {
			return res
				.status(403)
				.json({ error: 'Unauthorized access to certificate' });
		}

		if (!certificate.publicHash) {
			certificate.publicHash = generatePublicHash(certificate._id);
			await certificate.save();
		}

		const publicUrl = `${process.env.BASE_URL}/certificates/public/${certificate.publicHash}`;

		res.status(200).json({
			publicUrl,
			metadata: {
				studentName: certificate.studentName,
				courseTitle: certificate.courseTitle,
				issueDate: certificate.issueDate,
				verificationHash: certificate.publicHash,
			},
		});
	} catch (error) {
		logger.error(`Error generating public link: ${error.message}`);
		res.status(500).json({ error: 'Failed to generate public link' });
	}
};

// Get certificate metadata for social sharing
exports.getShareMetadata = async (req, res) => {
	try {
		const { certificateId } = req.params;
		const userId = req.user._id;

		const certificate = await Certificate.findById(certificateId);
		if (!certificate)
			return res.status(404).json({ error: 'Certificate not found' });

		if (certificate.studentId.toString() !== userId.toString()) {
			return res
				.status(403)
				.json({ error: 'Unauthorized access to certificate' });
		}

		if (!certificate.publicHash) {
			certificate.publicHash = generatePublicHash(certificate._id);
			await certificate.save();
		}

		if (!certificate.imageUrl) {
			const certificateImage = await generateCertificateImage(certificate);
			const imageKey = `certificates/${certificate._id}/certificate.png`;
			const uploadResult = await uploadToCloudStorage(
				imageKey,
				certificateImage
			);
			certificate.imageUrl = uploadResult.url;
			await certificate.save();
		}

		const verificationLink = `${process.env.BASE_URL}/certificate/verify/${certificate.publicHash}`;
		const shareMessage = `Just completed the ${certificate.courseTitle} course on ChainVerse Academy!`;

		res.status(200).json({
			courseTitle: certificate.courseTitle,
			studentName: certificate.studentName,
			certificateThumbnail: certificate.imageUrl,
			shareMessage,
			verificationLink,
		});
	} catch (error) {
		logger.error(`Error getting share metadata: ${error.message}`);
		res.status(500).json({ error: 'Failed to get share metadata' });
	}
};

// Track certificate sharing analytics
exports.trackShare = async (req, res) => {
	try {
		const { certificateId } = req.params;
		const { platform } = req.body;
		const userId = req.user._id;

		if (!platform)
			return res.status(400).json({ error: 'Platform is required' });

		const certificate = await Certificate.findById(certificateId);
		if (!certificate)
			return res.status(404).json({ error: 'Certificate not found' });

		if (certificate.studentId.toString() !== userId.toString()) {
			return res
				.status(403)
				.json({ error: 'Unauthorized access to certificate' });
		}

		const shareEvent = new ShareAnalytics({
			certificateId,
			userId,
			platform,
			sharedAt: new Date(),
		});

		await shareEvent.save();

		res.status(200).json({ message: 'Share event recorded successfully' });
	} catch (error) {
		logger.error(`Error tracking share: ${error.message}`);
		res.status(500).json({ error: 'Failed to track share event' });
	}
};

// Get certificate by public hash
exports.getPublicCertificate = async (req, res) => {
	try {
		const { publicHash } = req.params;
		const certificate = await Certificate.findOne({ publicHash });

		if (!certificate)
			return res.status(404).json({ error: 'Certificate not found' });

		res.status(200).json({
			studentName: certificate.studentName,
			courseTitle: certificate.courseTitle,
			issueDate: certificate.issueDate,
			imageUrl: certificate.imageUrl,
			verificationHash: certificate.publicHash,
		});
	} catch (error) {
		logger.error(`Error retrieving public certificate: ${error.message}`);
		res.status(500).json({ error: 'Failed to retrieve certificate' });
	}
};

// Get single certificate with ownership verification
exports.getSingleCertificate = async (req, res) => {
	try {
		const certificateId = req.params.certificateId || req.params.id;
		const studentId = req.user._id || req.user.id;

		const result = await certificateRetrievalService.getSingleCertificate(
			certificateId,
			studentId
		);

		return res.status(200).json(result);
	} catch (error) {
		logger.error(`Error in getSingleCertificate: ${error.message}`);

		if (
			error.message === 'Certificate not found' ||
			error.message === 'Unauthorized access to certificate'
		) {
			return res.status(404).json({
				success: false,
				message: error.message,
			});
		}

		return res.status(500).json({
			success: false,
			message: 'Error retrieving certificate',
			error: error.message,
		});
	}
};

// Download single certificate with token verification
exports.downloadSingleCertificate = async (req, res) => {
	try {
		const token = extractTokenFromRequest(req);

		if (!token) {
			return res.status(401).json({
				success: false,
				message: 'Download token is required',
			});
		}

		const decoded = verifyDownloadToken(token);
		const studentId = req.user._id || req.user.id;

		if (decoded.studentId !== studentId.toString()) {
			return res.status(403).json({
				success: false,
				message: 'Invalid download token',
			});
		}

		const isOwner = await certificateRetrievalService.verifyCertificateOwnership(
			decoded.certificateId,
			studentId
		);

		if (!isOwner) {
			return res.status(404).json({
				success: false,
				message: 'Certificate not found or access denied',
			});
		}

		const result = await certificateRetrievalService.getSingleCertificate(
			decoded.certificateId,
			studentId
		);

		if (result.data.certificateUrl) {
			return res.redirect(result.data.certificateUrl);
		}

		return res.status(200).json({
			success: true,
			message: 'Certificate download link',
			downloadUrl: result.data.imageUrl || result.data.certificateUrl,
		});
	} catch (error) {
		logger.error(`Error in downloadSingleCertificate: ${error.message}`);

		if (error.message.includes('expired')) {
			return res.status(401).json({
				success: false,
				message: 'Download token has expired',
			});
		}

		return res.status(500).json({
			success: false,
			message: 'Error downloading certificate',
			error: error.message,
		});
	}
};

// Verify certificate ownership endpoint
exports.verifyCertificateOwnershipEndpoint = async (req, res) => {
	try {
		const certificateId = req.params.certificateId || req.params.id;
		const studentId = req.user._id || req.user.id;

		const isOwner = await certificateRetrievalService.verifyCertificateOwnership(
			certificateId,
			studentId
		);

		return res.status(200).json({
			success: true,
			isOwner,
			message: isOwner
				? 'Certificate ownership verified'
				: 'Certificate not owned by this user',
		});
	} catch (error) {
		logger.error(`Error in verifyCertificateOwnership: ${error.message}`);
		return res.status(500).json({
			success: false,
			message: 'Error verifying ownership',
			error: error.message,
		});
	}
};
