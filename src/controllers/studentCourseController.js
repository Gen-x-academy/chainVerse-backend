const mongoose = require('mongoose');
const Course = require('../models/course');
const Student = require('../models/student');
const Enrollment = require('../models/enrollment');
const User = require('../models/User');
const { createStudent } = require('../utils/createStudent');
const CryptoPaymentService = require('../utils/cryptoPaymentService');

const handleError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message,
    });
};

const handleSuccess = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

exports.getStudentLearning = async (req, res) => {
    try {
        const userId = req.user._id;

        let student = await Student.findById(userId);
        if (!student) {
            student = await createStudent(userId, req.user.email);
        }

        const enrolledCourses = await Course.find({
            _id: { $in: student.enrolledCourses || [] }
        }).populate('tutor', 'name email');

        return handleSuccess(res, 200, 'Student learning courses retrieved successfully', {
            courses: enrolledCourses,
            totalCourses: enrolledCourses.length,
        });
    } catch (error) {
        console.error('Error retrieving student learning courses:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

exports.getStudentLearningById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        let student = await Student.findById(userId);
        if (!student) {
            student = await createStudent(userId, req.user.email);
        }

        const isEnrolled = student.enrolledCourses && student.enrolledCourses.includes(id);
        if (!isEnrolled) {
            return handleError(res, 403, 'Access denied. Course not enrolled by student');
        }

        const course = await Course.findById(id)
            .populate('tutor', 'name email')
            .populate('enrollments.student', 'name email');

        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        return handleSuccess(res, 200, 'Course details retrieved successfully', course);
    } catch (error) {
        console.error('Error retrieving student learning course by ID:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

exports.getAllCourses = async (req, res) => {
    try {
        const { page = 1, limit = 10, category, level } = req.query;

        let query = { 
            isPublished: true, 
            status: 'published' 
        };

        if (category) query.category = category;
        if (level) query.level = level;

        const courses = await Course.find(query)
            .populate('tutor', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await Course.countDocuments(query);

        return handleSuccess(res, 200, 'All available courses retrieved successfully', {
            courses,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalCourses: total,
        });
    } catch (error) {
        console.error('Error retrieving all courses:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

exports.searchCourses = async (req, res) => {
    try {
        const { searchTerm } = req.query;
        const { page = 1, limit = 10 } = req.query;

        if (!searchTerm) {
            return handleError(res, 400, 'Search term is required');
        }

        const query = {
            isPublished: true,
            status: 'published',
            $or: [
                { title: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } },
                { tags: { $in: [new RegExp(searchTerm, 'i')] } }
            ]
        };

        const courses = await Course.find(query)
            .populate('tutor', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await Course.countDocuments(query);

        return handleSuccess(res, 200, 'Courses search results retrieved successfully', {
            courses,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalCourses: total,
            searchTerm
        });
    } catch (error) {
        console.error('Error searching courses:', error);
        return handleError(res, 500, 'Internal server error');
    }
};

exports.purchaseCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { transactionHash, cryptoCurrency, amount } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return handleError(res, 400, 'Invalid Course ID format');
        }

        const course = await Course.findById(id);
        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        if (!course.isPublished || course.status !== 'published') {
            return handleError(res, 400, 'Course is not available for purchase');
        }

        if (!transactionHash || !cryptoCurrency || !amount) {
            return handleError(res, 400, 'Transaction hash, crypto currency, and amount are required');
        }

        let student = await Student.findById(userId);
        if (!student) {
            student = await createStudent(userId, req.user.email);
        }

        if (student.enrolledCourses && student.enrolledCourses.includes(id)) {
            return handleError(res, 400, 'Course already purchased');
        }

        const paymentVerification = await CryptoPaymentService.processCryptoPayment(
            id,
            userId,
            amount,
            cryptoCurrency,
            transactionHash
        );

        if (!paymentVerification.success) {
            return handleError(res, 400, `Payment verification failed: ${paymentVerification.error}`);
        }

        await Student.updateOne(
            { _id: userId },
            { $addToSet: { enrolledCourses: id } }
        );

        await Course.updateOne(
            { _id: id },
            { 
                $push: { 
                    enrollments: { 
                        student: userId,
                        enrolledAt: new Date()
                    } 
                },
                $inc: { totalEnrollments: 1 }
            }
        );

        await Enrollment.create({
            courseId: id,
            studentId: userId,
            completed: false
        });

        const updatedCourse = await Course.findById(id).populate('tutor', 'name email');

        return handleSuccess(res, 200, 'Course purchased successfully', {
            course: updatedCourse,
            payment: paymentVerification,
            message: 'Payment processed successfully and course enrolled'
        });
    } catch (error) {
        console.error('Error purchasing course:', error);
        return handleError(res, 500, 'Internal server error during purchase');
    }
};

exports.transferCourseOwnership = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { recipientEmail, transactionHash } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return handleError(res, 400, 'Invalid Course ID format');
        }

        if (!recipientEmail) {
            return handleError(res, 400, 'Recipient email is required');
        }

        const course = await Course.findById(id);
        if (!course) {
            return handleError(res, 404, 'Course not found');
        }

        let student = await Student.findById(userId);
        if (!student) {
            student = await createStudent(userId, req.user.email);
        }

        const isEnrolled = student.enrolledCourses && student.enrolledCourses.includes(id);
        if (!isEnrolled) {
            return handleError(res, 403, 'Access denied. You do not own this course');
        }

        const recipientUser = await User.findOne({ email: recipientEmail });
        if (!recipientUser) {
            return handleError(res, 404, 'Recipient not found');
        }

        let recipientStudent = await Student.findById(recipientUser._id);
        if (!recipientStudent) {
            recipientStudent = await createStudent(recipientUser._id, recipientEmail);
        }

        await Student.updateOne(
            { _id: userId },
            { $pull: { enrolledCourses: id } }
        );

        await Student.updateOne(
            { _id: recipientUser._id },
            { $addToSet: { enrolledCourses: id } }
        );

        await Course.updateOne(
            { _id: id },
            { $pull: { enrollments: { student: userId } } }
        );
        
        await Course.updateOne(
            { _id: id },
            { 
                $push: { 
                    enrollments: { 
                        student: recipientUser._id,
                        enrolledAt: new Date()
                    } 
                }
            }
        );
        await Enrollment.updateOne(
            { courseId: id, studentId: userId },
            { $set: { studentId: recipientUser._id } }
        );

        return handleSuccess(res, 200, 'Course ownership transferred successfully', {
            courseId: id,
            from: req.user.email,
            to: recipientEmail,
            message: 'Course transfer completed successfully'
        });
    } catch (error) {
        console.error('Error transferring course ownership:', error);
        return handleError(res, 500, 'Internal server error during transfer');
    }
};