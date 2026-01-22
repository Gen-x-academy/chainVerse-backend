const Quiz = require('../models/Quiz');

// CREATE
exports.createQuiz = async (req, res) => {
	try {
		const quiz = new Quiz({ ...req.body, createdBy: req.user._id });
		await quiz.save();
		res.status(201).json(quiz);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

// RETRIEVE
exports.getQuiz = async (req, res) => {
	try {
		const quiz = await Quiz.findById(req.params.id);
		if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
		res.json(quiz);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

// UPDATE (full or partial)
exports.updateQuiz = async (req, res) => {
	try {
		const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
			runValidators: true,
		});
		if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
		res.json(quiz);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

// DELETE
exports.deleteQuiz = async (req, res) => {
	try {
		const quiz = await Quiz.findByIdAndDelete(req.params.id);
		// TODO: Cascade delete related quiz attempts here
		if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
		res.json({ message: 'Quiz deleted' });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};

// DELETE Question
exports.deleteQuestion = async (req, res) => {
	try {
		const quiz = await Quiz.findById(req.params.quizId);
		if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
		quiz.questions.id(req.params.questionId).remove();
		await quiz.save();
		res.json(quiz);
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
};
