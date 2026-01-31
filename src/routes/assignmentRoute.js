const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { authenticateTutor, tutorRoleCheck } = require('../middlewares/tutorAuth');

// Tutor routes (Protected)
router.post(
    '/assignments',
    authenticateTutor,
    tutorRoleCheck,
    assignmentController.createAssignment
);

// General routes
router.get(
    '/assignments/:courseId',
    assignmentController.getAssignmentsByCourse
);

module.exports = router;
