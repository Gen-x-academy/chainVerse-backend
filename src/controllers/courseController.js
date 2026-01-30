const Course = require('../models/course');
const User = require('../models/User');
const Tutor = require('../models/tutors');
const { sendEmailTutorCourseAlert } = require('../utils/email');

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

// GET /admin/courses - Retrieve all courses (both published and unpublished)
exports.getAllCourses = async (req, res) => {
	try {
		const { page = 1, limit = 10, status, category, search } = req.query;

		// Build query
		let query = {};
		if (status) query.status = status;
		if (category) query.category = category;
		if (search) {
			query.$or = [
				{ title: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } },
			];
		}

		const courses = await Course.find(query)
			.populate('tutor', 'name email')
			.populate('reviewedBy', 'name')
			.sort({ createdAt: -1 })
			.limit(limit * 1)
			.skip((page - 1) * limit)
			.lean();

		const total = await Course.countDocuments(query);

		return handleSuccess(res, 200, 'Courses retrieved successfully', {
			courses,
			currentPage: parseInt(page),
			totalPages: Math.ceil(total / limit),
			totalCourses: total,
		});
	} catch (error) {
		console.error('Error retrieving courses:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// GET /admin/course/:id - Retrieve details of a single course
exports.getCourseById = async (req, res) => {
	try {
		const { id } = req.params;

		const course = await Course.findById(id)
			.populate('tutor', 'name email')
			.populate('reviewedBy', 'name')
			.populate('enrollments.student', 'name email');

		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		return handleSuccess(res, 200, 'Course retrieved successfully', course);
	} catch (error) {
		console.error('Error retrieving course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// POST /admin/course - Create a new course (admin only)
exports.createCourse = async (req, res) => {
	try {
		const {
			title,
			description,
			tutorId,
			category,
			tags,
			duration,
			level,
			price,
			thumbnail,
			videos,
		} = req.body;

		// Basic validation
		if (!title || !description || !tutorId) {
			return handleError(
				res,
				400,
				'Title, description, and tutor ID are required'
			);
		}

		// Verify tutor exists
		const tutor = await User.findById(tutorId);
		if (!tutor) {
			return handleError(res, 404, 'Tutor not found');
		}

		const course = new Course({
			title: title.trim(),
			description,
			tutor: tutorId,
			tutorEmail: tutor.email,
			tutorName: tutor.name,
			category,
			tags: tags || [],
			duration,
			level: level || 'Beginner',
			price: price || 0,
			thumbnail,
			videos: videos || [],
			status: 'approved',
			isPublished: false,
			reviewedBy: req.user._id,
			reviewedAt: new Date(),
		});

		const savedCourse = await course.save();

		return handleSuccess(res, 201, 'Course created successfully', savedCourse);
	} catch (error) {
		console.error('Error creating course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// POST /admin/course/review/:id - Approve or reject a course
exports.reviewCourse = async (req, res) => {
	try {
		const { id } = req.params;
		const { action, rejectionReason } = req.body;

		if (!['approve', 'reject'].includes(action)) {
			return handleError(
				res,
				400,
				'Action must be either "approve" or "reject"'
			);
		}

		if (action === 'reject' && !rejectionReason) {
			return handleError(
				res,
				400,
				'Rejection reason is required when rejecting a course'
			);
		}

		const course = await Course.findById(id).populate('tutor', 'name email');
		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		// Update course status
		course.status = action === 'approve' ? 'approved' : 'rejected';
		course.reviewedBy = req.user._id;
		course.reviewedAt = new Date();

		if (action === 'reject') {
			course.rejectionReason = rejectionReason;
		}

		await course.save();

		// Send email notification to tutor
		try {
			if (action === 'approve') {
				await sendEmailTutorCourseAlert(
					course.tutorEmail,
					'Course Approved - ChainVerse Academy',
					`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4CAF50;">🎉 Course Approved!</h2>
              <p>Dear ${course.tutorName},</p>
              <p>Great news! Your course "<strong>${course.title}</strong>" has been approved by our admin team.</p>
              <p>You can now publish your course to make it available to students on ChainVerse Academy.</p>
              <p>Thank you for contributing to our learning community!</p>
              <hr>
              <p style="color: #666; font-size: 12px;">Best regards,<br>ChainVerse Academy Team</p>
            </div>
          `
				);
			} else {
				await sendEmailTutorCourseAlert(
					course.tutorEmail,
					'Course Review Update - ChainVerse Academy',
					`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f44336;">Course Review Required</h2>
              <p>Dear ${course.tutorName},</p>
              <p>Your course "<strong>${course.title}</strong>" requires some updates before it can be approved.</p>
              <p><strong>Reason for rejection:</strong></p>
              <p style="background-color: #f5f5f5; padding: 10px; border-left: 4px solid #f44336;">${rejectionReason}</p>
              <p>Please make the necessary changes and resubmit your course for review.</p>
              <hr>
              <p style="color: #666; font-size: 12px;">Best regards,<br>ChainVerse Academy Team</p>
            </div>
          `
				);
			}
		} catch (emailError) {
			console.error('Error sending email notification:', emailError);
			// Continue execution even if email fails
		}

		return handleSuccess(res, 200, `Course ${action}d successfully`, course);
	} catch (error) {
		console.error('Error reviewing course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// PATCH /admin/course/publish/:id - Publish a course
exports.publishCourse = async (req, res) => {
	try {
		const { id } = req.params;

		const course = await Course.findById(id);
		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		if (course.status !== 'approved') {
			return handleError(res, 400, 'Only approved courses can be published');
		}

		course.isPublished = true;
		course.status = 'published';
		await course.save();

		return handleSuccess(res, 200, 'Course published successfully', course);
	} catch (error) {
		console.error('Error publishing course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// PATCH /admin/course/unpublish/:id - Unpublish a course
exports.unpublishCourse = async (req, res) => {
	try {
		const { id } = req.params;

		const course = await Course.findById(id);
		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		course.isPublished = false;
		course.status = 'unpublished';
		await course.save();

		return handleSuccess(res, 200, 'Course unpublished successfully', course);
	} catch (error) {
		console.error('Error unpublishing course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// DELETE /admin/course/:id - Delete a course
exports.deleteCourse = async (req, res) => {
	try {
		const { id } = req.params;

		const course = await Course.findById(id);
		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		// Check if course has enrollments
		if (course.enrollments && course.enrollments.length > 0) {
			return handleError(
				res,
				400,
				'Cannot delete course with active enrollments'
			);
		}

		await Course.findByIdAndDelete(id);

		return handleSuccess(res, 200, 'Course deleted successfully');
	} catch (error) {
		console.error('Error deleting course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// PATCH /admin/course/update/:id - Edit/update course details
exports.updateCourse = async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;

		// Remove fields that shouldn't be updated directly
		delete updateData.createdAt;
		delete updateData._id;
		delete updateData.enrollments;
		delete updateData.studentProgress;
		delete updateData.completionDates;
		delete updateData.quizResults;

		const course = await Course.findByIdAndUpdate(
			id,
			{ ...updateData, updatedAt: new Date() },
			{ new: true, runValidators: true }
		).populate('tutor', 'name email');

		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		return handleSuccess(res, 200, 'Course updated successfully', course);
	} catch (error) {
		console.error('Error updating course:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// GET /admin/course/enrollments/:id - View enrolled students for a course
exports.getCourseEnrollments = async (req, res) => {
	try {
		const { id } = req.params;
		const { page = 1, limit = 10 } = req.query;

		const course = await Course.findById(id)
			.populate({
				path: 'enrollments.student',
				select: 'name email createdAt',
			})
			.select('title enrollments totalEnrollments');

		if (!course) {
			return handleError(res, 404, 'Course not found');
		}

		// Paginate enrollments
		const startIndex = (page - 1) * limit;
		const endIndex = page * limit;
		const paginatedEnrollments = course.enrollments.slice(startIndex, endIndex);

		return handleSuccess(
			res,
			200,
			'Course enrollments retrieved successfully',
			{
				courseTitle: course.title,
				totalEnrollments: course.totalEnrollments,
				enrollments: paginatedEnrollments,
				currentPage: parseInt(page),
				totalPages: Math.ceil(course.enrollments.length / limit),
			}
		);
	} catch (error) {
		console.error('Error retrieving course enrollments:', error);
		return handleError(res, 500, 'Internal server error');
	}
};

// module.exports = {
// 	getAllCourses,
// 	getCourseById,
// 	createCourse,
// 	reviewCourse,
// 	publishCourse,
// 	unpublishCourse,
// 	deleteCourse,
// 	updateCourse,
// getCourseEnrollments,
// };

// POST /courses - Create a new course (Tutor only)
exports.createCourseByTutor = async (req, res) => {
	try {
		const {
			title,
			description,
			category,
			tags,
			duration,
			level,
			price,
			thumbnail,
			videos,
			prerequisites,
			resources
		} = req.body;

		if (!title || !description) {
			return handleError(res, 400, "Title and description are required");
		}

		const tutor = await Tutor.findById(req.tutor._id);
		if (!tutor) {
			return handleError(res, 404, "Tutor not found");
		}

		const course = new Course({
			title: title.trim(),
			description,
			tutor: req.tutor._id,
			tutorEmail: tutor.email,
			tutorName: tutor.fullName,
			category,
			tags: tags || [],
			duration,
			level: level || "Beginner",
			price: price || 0,
			thumbnail,
			videos: videos || [],
			prerequisites: prerequisites || [],
			resources: resources || [],
			status: "draft",
			isPublished: false,
		});

		const savedCourse = await course.save();
		return handleSuccess(res, 201, "Course created successfully", savedCourse);
	} catch (error) {
		console.error("Error creating course:", error);
		return handleError(res, 500, "Internal server error");
	}
};

// PUT /courses/:id - Update a course (Tutor only)
exports.updateCourseByTutor = async (req, res) => {
	try {
		const { id } = req.params;
		const updateData = req.body;

		const course = await Course.findById(id);
		if (!course) {
			return handleError(res, 404, "Course not found");
		}

		if (course.tutor.toString() !== req.tutor._id.toString()) {
			return handleError(res, 403, "You can only update your own courses");
		}

		delete updateData.tutor;
		delete updateData.tutorEmail;
		delete updateData.tutorName;
		delete updateData.status;

		const updatedCourse = await Course.findByIdAndUpdate(
			id,
			{ ...updateData, updatedAt: new Date() },
			{ new: true, runValidators: true }
		);

		return handleSuccess(res, 200, "Course updated successfully", updatedCourse);
	} catch (error) {
		console.error("Error updating course:", error);
		return handleError(res, 500, "Internal server error");
	}
};

// DELETE /courses/:id - Delete a course (Tutor only)
exports.deleteCourseByTutor = async (req, res) => {
	try {
		const { id } = req.params;

		const course = await Course.findById(id);
		if (!course) {
			return handleError(res, 404, "Course not found");
		}

		if (course.tutor.toString() !== req.tutor._id.toString()) {
			return handleError(res, 403, "You can only delete your own courses");
		}

		if (course.enrollments && course.enrollments.length > 0) {
			return handleError(res, 400, "Cannot delete course with active enrollments");
		}

		await Course.findByIdAndDelete(id);
		return handleSuccess(res, 200, "Course deleted successfully");
	} catch (error) {
		console.error("Error deleting course:", error);
		return handleError(res, 500, "Internal server error");
	}
};
