const Assignment = require('../models/assignment');
const Course = require('../models/course');

// POST /assignments - Create a new assignment (Tutor only)
exports.createAssignment = async (req, res) => {
    try {
        const { title, description, dueDate, courseId, resources, maxScore } = req.body;

        // Validate required fields
        if (!title || !description || !dueDate || !courseId) {
            return res.status(400).json({
                success: false,
                message: 'Title, description, dueDate, and courseId are required',
            });
        }

        // Verify course exists and belongs to the tutor
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found',
            });
        }

        if (course.tutor.toString() !== req.tutor._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only create assignments for your own courses',
            });
        }

        const assignment = new Assignment({
            title,
            description,
            dueDate,
            courseId,
            tutorId: req.tutor._id,
            resources: resources || [],
            maxScore: maxScore || 100,
        });

        await assignment.save();

        return res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            data: assignment,
        });
    } catch (error) {
        console.error('Error creating assignment:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

// GET /assignments/:courseId - Get assignments for a course
exports.getAssignmentsByCourse = async (req, res) => {
    try {
        const { courseId } = req.params;

        const assignments = await Assignment.find({ courseId })
            .sort({ dueDate: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: assignments.length,
            data: assignments,
        });
    } catch (error) {
        console.error('Error retrieving assignments:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};
