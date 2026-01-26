const mongoose = require('mongoose');
const Certificate = require('../models/certificate');
const Course = require('../models/course');
const Student = require('../models/student');
const User = require('../models/User');
const { generatePDF } = require('../utils/pdfGenerator');
const { uploadToS3 } = require('../utils/s3Uploader');
const { generatePublicHash } = require('../utils/hashGenerator');
const { uploadToCloudStorage } = require('../utils/cloudStorage');
const { generateCertificateImage } = require('../utils/certificateGenerator');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { createHash } = require('crypto');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { sendCertificateNotification } = require('../utils/certificateEmailService');

// Utility function for error handling
const handleError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message,
    });
};

// Utility function for success response
const handleSuccess = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

// Generate verification hash for certificate
const generateVerificationHash = (certificate) => {
    const data = `${certificate.studentId}${certificate.courseId}${certificate.issueDate}${certificate.certificateId}`;
    return createHash('sha256').update(data).digest('hex');
};

// POST /certificates/generate - Generate a certificate for a student and course
exports.generateCertificate = async (req, res) => {
    try {
        const { studentId, courseId } = req.body;

        // Validate required fields
        if (!studentId || !courseId) {
            return handleError(res, 400, 'Student ID and Course ID are required');
        }

        // Validate MongoDB Object IDs
        if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(courseId)) {
            return handleError(res, 400, 'Invalid Student ID or Course ID format');
        }

        // Check if student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return handleError(res, 404, 'Student not found');
        }

        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        // Check if certificate already exists for this student and course
        const existingCertificate = await Certificate.findOne({
            studentId: studentId,
            courseId: courseId
        });

        if (existingCertificate) {
            return handleError(res, 400, 'Certificate already exists for this student and course');
        }

        // Generate unique identifiers
        const certificateId = uuidv4();
        const publicHash = generatePublicHash(`${studentId}-${courseId}-${Date.now()}`);
        const verificationLink = `${process.env.BASE_URL || 'https://chainverse.academy'}/certificates/verify/${publicHash}`;

        // Create the certificate
        const certificate = new Certificate({
            certificateId,
            studentId,
            courseId,
            studentFullName: student.name || student.email.split('@')[0],
            courseTitle: course.title,
            courseInstructorName: course.tutorName || 'TBD',
            verificationLink,
            publicHash,
            certificateHash: generateVerificationHash({
                studentId,
                courseId,
                issueDate: new Date(),
                certificateId
            }),
            web3Badge: course.tags && course.tags.includes('web3') ? true : false
        });

        // Save the certificate
        await certificate.save();

        // Generate PDF certificate
        const verificationId = uuidv4();
        const qrData = verificationLink;
        const qrCode = await QRCode.toDataURL(qrData);

        const pdfBuffer = await generatePDF({
            studentName: certificate.studentFullName,
            courseTitle: certificate.courseTitle,
            tutorName: certificate.courseInstructorName,
            completionDate: certificate.completionDate.toLocaleDateString(),
            qrCode,
            verificationId,
        });

        // Upload PDF to storage
        const pdfUrl = await uploadToS3(
            pdfBuffer,
            `certificates/${studentId}_${courseId}_${Date.now()}.pdf`
        );

        // Update certificate with PDF URL
        certificate.certificateUrl = pdfUrl;
        await certificate.save();

        // Generate certificate image
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

        // Send email notification to the student
        try {
            const emailSent = await sendCertificateNotification(
                student.email,
                student.name || student.email.split('@')[0],
                course.title,
                `${process.env.BASE_URL || 'https://chainverse.academy'}/certificates/${certificate.certificateId}`,
                verificationLink
            );

            if (!emailSent) {
                logger.warn(`Failed to send certificate notification email to ${student.email}`);
            }
        } catch (emailError) {
            logger.error(`Error sending certificate notification:`, emailError);
            // Don't fail the certificate creation if email fails
        }

        return handleSuccess(res, 201, 'Certificate generated successfully', {
            certificate: certificate.toObject()
        });
    } catch (error) {
        console.error('Error generating certificate:', error);
        return handleError(res, 500, 'Internal server error during certificate generation');
    }
};

// GET /certificates/my-certificates - Get all certificates for the authenticated student
exports.getMyCertificates = async (req, res) => {
    try {
        const userId = req.user._id;
        const { courseId, startDate, endDate, sortBy = 'issueDate', sortOrder = 'desc' } = req.query;

        // Build query
        let query = { studentId: userId, status: 'ACTIVE' };

        if (courseId) {
            query.courseId = courseId;
        }

        if (startDate || endDate) {
            query.completionDate = {};
            if (startDate) query.completionDate.$gte = new Date(startDate);
            if (endDate) query.completionDate.$lte = new Date(endDate);
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const certificates = await Certificate.find(query)
            .populate('courseId', 'title')
            .populate('studentId', 'name email')
            .sort(sortObj);

        return handleSuccess(res, 200, 'Certificates retrieved successfully', {
            certificates,
            total: certificates.length
        });
    } catch (error) {
        console.error('Error retrieving certificates:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

// GET /certificates/:certificateId - Get a specific certificate by ID
exports.getCertificateById = async (req, res) => {
    try {
        const { certificateId } = req.params;
        const userId = req.user._id;

        // Find certificate by certificateId
        const certificate = await Certificate.findOne({
            certificateId: certificateId,
            studentId: userId
        });

        if (!certificate) {
            return handleError(res, 404, 'Certificate not found or unauthorized access');
        }

        // Generate image if not already present
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

        return handleSuccess(res, 200, 'Certificate retrieved successfully', certificate);
    } catch (error) {
        console.error('Error retrieving certificate:', error);
        return handleError(res, 500, 'Failed to retrieve certificate');
    }
};

// Trigger certificate generation on course completion
// This function can be called from other parts of the application when course completion is detected
exports.triggerCertificateGeneration = async (studentId, courseId) => {
    try {
        // Check if student exists
        const student = await Student.findById(studentId);
        if (!student) {
            throw new Error('Student not found');
        }

        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
            throw new Error('Course not found');
        }

        // Check if certificate already exists for this student and course
        const existingCertificate = await Certificate.findOne({
            studentId: studentId,
            courseId: courseId
        });

        if (existingCertificate) {
            logger.info(`Certificate already exists for student ${studentId} and course ${courseId}`);
            return existingCertificate;
        }

        // Generate unique identifiers
        const certificateId = uuidv4();
        const publicHash = generatePublicHash(`${studentId}-${courseId}-${Date.now()}`);
        const verificationLink = `${process.env.BASE_URL || 'https://chainverse.academy'}/certificates/verify/${publicHash}`;

        // Create the certificate
        const certificate = new Certificate({
            certificateId,
            studentId,
            courseId,
            studentFullName: student.name || student.email.split('@')[0],
            courseTitle: course.title,
            courseInstructorName: course.tutorName || 'TBD',
            completionDate: new Date(),
            verificationLink,
            publicHash,
            certificateHash: generateVerificationHash({
                studentId,
                courseId,
                issueDate: new Date(),
                certificateId
            }),
            web3Badge: course.tags && course.tags.includes('web3') ? true : false
        });

        // Save the certificate
        await certificate.save();

        // Generate PDF certificate
        const verificationId = uuidv4();
        const qrData = verificationLink;
        const qrCode = await QRCode.toDataURL(qrData);

        const pdfBuffer = await generatePDF({
            studentName: certificate.studentFullName,
            courseTitle: certificate.courseTitle,
            tutorName: certificate.courseInstructorName,
            completionDate: certificate.completionDate.toLocaleDateString(),
            qrCode,
            verificationId,
        });

        // Upload PDF to storage
        const pdfUrl = await uploadToS3(
            pdfBuffer,
            `certificates/${studentId}_${courseId}_${Date.now()}.pdf`
        );

        // Update certificate with PDF URL
        certificate.certificateUrl = pdfUrl;
        await certificate.save();

        // Generate certificate image
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

        // Send email notification to the student
        try {
            const emailSent = await sendCertificateNotification(
                student.email,
                student.name || student.email.split('@')[0],
                course.title,
                `${process.env.BASE_URL || 'https://chainverse.academy'}/certificates/${certificate.certificateId}`,
                verificationLink
            );

            if (!emailSent) {
                logger.warn(`Failed to send certificate notification email to ${student.email}`);
            }
        } catch (emailError) {
            logger.error(`Error sending certificate notification:`, emailError);
            // Don't fail the certificate creation if email fails
        }

        logger.info(`Certificate generated successfully for student ${studentId} and course ${courseId}`);

        return certificate;
    } catch (error) {
        logger.error(`Error triggering certificate generation: ${error.message}`);
        throw error;
    }
};

// Verify a certificate by public hash (public endpoint)
exports.verifyCertificate = async (req, res) => {
    try {
        const { publicHash } = req.params;

        const certificate = await Certificate.findOne({ publicHash })
            .populate('studentId', 'name email')
            .populate('courseId', 'title description');

        if (!certificate) {
            return handleError(res, 404, 'Certificate not found');
        }

        // Return certificate details for verification
        return handleSuccess(res, 200, 'Certificate verified successfully', {
            valid: true,
            certificate: {
                studentFullName: certificate.studentFullName,
                courseTitle: certificate.courseTitle,
                completionDate: certificate.completionDate,
                issuedBy: certificate.issuedBy,
                courseInstructorName: certificate.courseInstructorName,
                verificationLink: certificate.verificationLink,
                web3Badge: certificate.web3Badge,
                certificateId: certificate.certificateId,
                issueDate: certificate.issueDate
            }
        });
    } catch (error) {
        console.error('Error verifying certificate:', error);
        return handleError(res, 500, 'Failed to verify certificate');
    }
};

// Revoke a certificate (admin function)
exports.revokeCertificate = async (req, res) => {
    try {
        const { certificateId } = req.params;
        const { reason } = req.body;

        const certificate = await Certificate.findOne({ certificateId });
        if (!certificate) {
            return handleError(res, 404, 'Certificate not found');
        }

        certificate.status = 'REVOKED';
        certificate.revocationReason = reason;
        await certificate.save();

        return handleSuccess(res, 200, 'Certificate revoked successfully', {
            certificateId: certificate.certificateId,
            status: certificate.status
        });
    } catch (error) {
        console.error('Error revoking certificate:', error);
        return handleError(res, 500, 'Failed to revoke certificate');
    }
};

// Download certificate as PDF
exports.downloadCertificate = async (req, res) => {
    try {
        const { certificateId } = req.params;
        const userId = req.user._id;

        const certificate = await Certificate.findOne({
            certificateId: certificateId,
            studentId: userId
        });

        if (!certificate) {
            return handleError(res, 404, 'Certificate not found or unauthorized access');
        }

        if (!certificate.certificateUrl) {
            return handleError(res, 404, 'Certificate PDF not available');
        }

        // This assumes the certificateUrl is a downloadable URL
        // In a real implementation, you would fetch the file and send it
        return res.redirect(certificate.certificateUrl);
    } catch (error) {
        console.error('Error downloading certificate:', error);
        return handleError(res, 500, 'Failed to download certificate');
    }
};

// Complete a course and generate certificate automatically
// This function is triggered when a student marks a course as complete
exports.completeCourse = async (req, res) => {
    try {
        const studentId = req.user._id;
        const courseId = req.params.id;

        // Validate course ID format
        if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
            return handleError(res, 400, 'Invalid Course ID format');
        }

        // Check if student is enrolled in the course
        const student = await Student.findById(studentId);
        if (!student) {
            return handleError(res, 404, 'Student not found');
        }

        const isEnrolled = student.enrolledCourses && 
                          student.enrolledCourses.some(course => course.toString() === courseId);
        
        if (!isEnrolled) {
            return handleError(res, 403, 'Access denied. Student not enrolled in this course');
        }

        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        // Check if certificate already exists for this student and course
        const existingCertificate = await Certificate.findOne({
            studentId: studentId,
            courseId: courseId
        });

        if (existingCertificate) {
            // If certificate already exists, return it
            return handleSuccess(res, 200, 'Course already completed and certificate exists', {
                certificate: existingCertificate
            });
        }

        // Generate certificate automatically
        const certificate = await exports.triggerCertificateGeneration(studentId, courseId);

        // Update student's completed courses
        await Student.updateOne(
            { _id: studentId },
            { $addToSet: { completedCourses: courseId } }
        );

        // Update course completion tracking
        await Course.updateOne(
            { _id: courseId },
            { 
                $set: { [`completionDates.${studentId}`]: new Date() },
                $inc: { [`studentProgress.${studentId}`]: 100 } // Mark as 100% complete
            }
        );

        // Update enrollment status
        await Enrollment.updateOne(
            { courseId: courseId, studentId: studentId },
            { completed: true }
        );

        // Award gamification points
        try {
            const gamificationService = require('../utils/gamificationService');
            await gamificationService.awardCourseCompletionPoints(
                studentId,
                courseId,
                course.title
            );
        } catch (pointsError) {
            logger.warn('Failed to award gamification points:', pointsError.message);
        }

        return handleSuccess(res, 200, 'Course completed successfully', {
            certificate: certificate,
            message: 'Course completed and certificate generated successfully'
        });
    } catch (error) {
        console.error('Error completing course:', error);
        return handleError(res, 500, 'Internal server error during course completion');
    }
};