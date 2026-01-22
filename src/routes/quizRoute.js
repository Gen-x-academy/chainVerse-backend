const express = require('express');
const Quiz = require('../models/Quiz');
const { authenticate, hasRole } = require('../middlewares/auth');
const {
	validateQuizCreation,
	validateQuizUpdate,
	validateQuizId,
	validateQuestionId,
	validateRequest,
	validateQuizBusinessRules,
	sanitizeInput,
} = require('../middlewares/validation');
const { asyncHandler } = require('../middlewares/errorHandler');

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

/**
 * @route   POST /api/quizzes
 * @desc    Create a new quiz
 * @access  Tutors and Admins only
 */
router.post(
	'/',
	hasRole(['tutor', 'admin']),
	sanitizeInput,
	validateQuizCreation,
	validateRequest,
	validateQuizBusinessRules,
	asyncHandler(async (req, res) => {
		const { courseId, moduleId, title, description, questions } = req.body;

		// Check for existing quiz with same title in the same module
		const existingQuiz = await Quiz.findOne({
			moduleId,
			title: { $regex: new RegExp(`^${title}$`, 'i') },
			isActive: true,
		});

		if (existingQuiz) {
			return res.status(409).json({
				error: 'A quiz with this title already exists in this module',
				code: 'DUPLICATE_QUIZ_TITLE',
			});
		}

		const quiz = new Quiz({
			courseId,
			moduleId,
			title,
			description,
			questions,
			createdBy: req.user._id,
			updatedBy: req.user._id,
		});

		await quiz.save();

		res.status(201).json({
			message: 'Quiz created successfully',
			data: quiz,
			meta: {
				questionCount: quiz.questions.length,
				createdBy: req.user.name,
				createdAt: quiz.createdAt,
			},
		});
	})
);

/**
 * @route   GET /api/quizzes/:quizId
 * @desc    Get quiz by ID
 * @access  All authenticated users
 */
router.get(
	'/:quizId',
	validateQuizId,
	validateRequest,
	asyncHandler(async (req, res) => {
		const { quizId } = req.params;
		const { includeAnswers } = req.query;

		const quiz = await Quiz.findOne({ _id: quizId, isActive: true });

		if (!quiz) {
			return res.status(404).json({
				error: 'Quiz not found',
				code: 'QUIZ_NOT_FOUND',
			});
		}

		// Hide correct answers for students unless explicitly requested by tutors/admins
		let responseQuiz = quiz.toObject();
		if (req.user.role === 'student' && includeAnswers !== 'true') {
			responseQuiz.questions = responseQuiz.questions.map((question) => ({
				...question,
				options: question.options.map((option) => ({
					_id: option._id,
					text: option.text,
					// isCorrect field is omitted for students
				})),
			}));
		}

		res.json({
			message: 'Quiz retrieved successfully',
			data: responseQuiz,
			meta: {
				questionCount: quiz.questions.length,
				totalOptions: quiz.questions.reduce(
					(sum, q) => sum + q.options.length,
					0
				),
			},
		});
	})
);

/**
 * @route   GET /api/quizzes
 * @desc    Get quizzes with filtering and pagination
 * @access  All authenticated users
 */
router.get(
	'/',
	asyncHandler(async (req, res) => {
		const {
			courseId,
			moduleId,
			page = 1,
			limit = 10,
			search,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = req.query;

		// Build filter object
		const filter = { isActive: true };
		if (courseId) filter.courseId = courseId;
		if (moduleId) filter.moduleId = moduleId;
		if (search) {
			filter.$or = [
				{ title: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } },
			];
		}

		// For students, only show basic quiz info
		const projection =
			req.user.role === 'student'
				? {
						title: 1,
						description: 1,
						courseId: 1,
						moduleId: 1,
						createdAt: 1,
						'questions.text': 1,
				  }
				: {};

		const options = {
			page: parseInt(page),
			limit: parseInt(limit),
			sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
			projection,
		};

		const skip = (options.page - 1) * options.limit;

		const [quizzes, total] = await Promise.all([
			Quiz.find(filter, projection)
				.sort(options.sort)
				.skip(skip)
				.limit(options.limit),
			Quiz.countDocuments(filter),
		]);

		res.json({
			message: 'Quizzes retrieved successfully',
			data: quizzes,
			meta: {
				total,
				page: options.page,
				limit: options.limit,
				totalPages: Math.ceil(total / options.limit),
				hasNextPage: options.page < Math.ceil(total / options.limit),
				hasPrevPage: options.page > 1,
			},
		});
	})
);

/**
 * @route   PUT /api/quizzes/:quizId
 * @desc    Update quiz
 * @access  Tutors and Admins only
 */
router.put(
	'/:quizId',
	hasRole(['tutor', 'admin']),
	validateQuizId,
	sanitizeInput,
	validateQuizUpdate,
	validateRequest,
	validateQuizBusinessRules,
	asyncHandler(async (req, res) => {
		const { quizId } = req.params;
		const updateData = { ...req.body, updatedBy: req.user._id };

		const quiz = await Quiz.findOne({ _id: quizId, isActive: true });

		if (!quiz) {
			return res.status(404).json({
				error: 'Quiz not found',
				code: 'QUIZ_NOT_FOUND',
			});
		}

		// Check if title is being updated and if it conflicts
		if (updateData.title && updateData.title !== quiz.title) {
			const existingQuiz = await Quiz.findOne({
				_id: { $ne: quizId },
				moduleId: quiz.moduleId,
				title: { $regex: new RegExp(`^${updateData.title}$`, 'i') },
				isActive: true,
			});

			if (existingQuiz) {
				return res.status(409).json({
					error: 'A quiz with this title already exists in this module',
					code: 'DUPLICATE_QUIZ_TITLE',
				});
			}
		}

		// Update quiz
		Object.assign(quiz, updateData);
		await quiz.save();

		res.json({
			message: 'Quiz updated successfully',
			data: quiz,
			meta: {
				version: quiz.version,
				updatedBy: req.user.name,
				updatedAt: quiz.updatedAt,
			},
		});
	})
);

/**
 * @route   DELETE /api/quizzes/:quizId
 * @desc    Delete quiz (soft delete)
 * @access  Tutors and Admins only
 */
router.delete(
	'/:quizId',
	hasRole(['tutor', 'admin']),
	validateQuizId,
	validateRequest,
	asyncHandler(async (req, res) => {
		const { quizId } = req.params;
		const { permanent } = req.query;

		const quiz = await Quiz.findOne({ _id: quizId, isActive: true });

		if (!quiz) {
			return res.status(404).json({
				error: 'Quiz not found',
				code: 'QUIZ_NOT_FOUND',
			});
		}

		if (permanent === 'true' && req.user.role === 'admin') {
			// Hard delete for admins only
			await Quiz.findByIdAndDelete(quizId);
			res.json({
				message: 'Quiz permanently deleted',
				code: 'QUIZ_PERMANENTLY_DELETED',
			});
		} else {
			// Soft delete
			quiz.isActive = false;
			quiz.updatedBy = req.user._id;
			await quiz.save();

			res.json({
				message: 'Quiz deleted successfully',
				code: 'QUIZ_SOFT_DELETED',
			});
		}
	})
);

/**
 * @route   DELETE /api/quizzes/:quizId/questions/:questionId
 * @desc    Delete a specific question from quiz
 * @access  Tutors and Admins only
 */
router.delete(
	'/:quizId/questions/:questionId',
	hasRole(['tutor', 'admin']),
	validateQuizId,
	validateQuestionId,
	validateRequest,
	asyncHandler(async (req, res) => {
		const { quizId, questionId } = req.params;

		const quiz = await Quiz.findOne({ _id: quizId, isActive: true });

		if (!quiz) {
			return res.status(404).json({
				error: 'Quiz not found',
				code: 'QUIZ_NOT_FOUND',
			});
		}

		const questionIndex = quiz.questions.findIndex((q) => q._id === questionId);

		if (questionIndex === -1) {
			return res.status(404).json({
				error: 'Question not found',
				code: 'QUESTION_NOT_FOUND',
			});
		}

		// Check if removing this question would violate minimum question requirement
		if (quiz.questions.length <= 5) {
			return res.status(400).json({
				error: 'Cannot delete question. Quiz must have at least 5 questions',
				code: 'MINIMUM_QUESTIONS_REQUIRED',
			});
		}

		quiz.questions.splice(questionIndex, 1);
		quiz.updatedBy = req.user._id;
		await quiz.save();

		res.json({
			message: 'Question deleted successfully',
			data: quiz,
			meta: {
				remainingQuestions: quiz.questions.length,
				deletedQuestionId: questionId,
			},
		});
	})
);

/**
 * @route   POST /api/quizzes/:quizId/questions
 * @desc    Add a new question to existing quiz
 * @access  Tutors and Admins only
 */
router.post(
	'/:quizId/questions',
	hasRole(['tutor', 'admin']),
	validateQuizId,
	sanitizeInput,
	validateRequest,
	asyncHandler(async (req, res) => {
		const { quizId } = req.params;
		const { text, options, explanation } = req.body;

		// Validate question data
		if (!text || text.length > 500) {
			return res.status(400).json({
				error: 'Question text is required and must not exceed 500 characters',
				code: 'INVALID_QUESTION_TEXT',
			});
		}

		if (!options || options.length < 2 || options.length > 5) {
			return res.status(400).json({
				error: 'Question must have between 2 and 5 options',
				code: 'INVALID_OPTIONS_COUNT',
			});
		}

		const correctOptions = options.filter((option) => option.isCorrect);
		if (correctOptions.length === 0) {
			return res.status(400).json({
				error: 'Question must have at least one correct option',
				code: 'NO_CORRECT_OPTION',
			});
		}

		const quiz = await Quiz.findOne({ _id: quizId, isActive: true });

		if (!quiz) {
			return res.status(404).json({
				error: 'Quiz not found',
				code: 'QUIZ_NOT_FOUND',
			});
		}

		const newQuestion = {
			text,
			options,
			explanation,
		};

		quiz.questions.push(newQuestion);
		quiz.updatedBy = req.user._id;
		await quiz.save();

		res.status(201).json({
			message: 'Question added successfully',
			data: quiz,
			meta: {
				totalQuestions: quiz.questions.length,
				addedQuestion: newQuestion,
			},
		});
	})
);

module.exports = router;
