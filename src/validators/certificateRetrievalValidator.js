const { query, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Validate query parameters for fetching certificates
const validateCertificateQuery = [
	query('courseId')
		.optional()
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage('Invalid course ID format'),

	query('completionDateStart')
		.optional()
		.isISO8601()
		.withMessage('Invalid completion start date format'),

	query('completionDateEnd')
		.optional()
		.isISO8601()
		.withMessage('Invalid completion end date format'),

	query('issueDateStart')
		.optional()
		.isISO8601()
		.withMessage('Invalid issue start date format'),

	query('issueDateEnd')
		.optional()
		.isISO8601()
		.withMessage('Invalid issue end date format'),

	query('page')
		.optional()
		.isInt({ min: 1 })
		.withMessage('Page must be a positive integer'),

	query('limit')
		.optional()
		.isInt({ min: 1, max: 100 })
		.withMessage('Limit must be between 1 and 100'),

	query('status')
		.optional()
		.isIn(['ACTIVE', 'REVOKED', 'EXPIRED'])
		.withMessage('Invalid status value'),

	// Custom validation: end date must be after start date
	query('completionDateEnd').custom((value, { req }) => {
		if (value && req.query.completionDateStart) {
			const start = new Date(req.query.completionDateStart);
			const end = new Date(value);
			if (end <= start) {
				throw new Error('Completion end date must be after start date');
			}
		}
		return true;
	}),

	query('issueDateEnd').custom((value, { req }) => {
		if (value && req.query.issueDateStart) {
			const start = new Date(req.query.issueDateStart);
			const end = new Date(value);
			if (end <= start) {
				throw new Error('Issue end date must be after start date');
			}
		}
		return true;
	}),
];

// Validate certificate ID parameter
const validateCertificateId = [
	param('certificateId')
		.notEmpty()
		.withMessage('Certificate ID is required')
		.custom((value) => mongoose.Types.ObjectId.isValid(value))
		.withMessage('Invalid certificate ID format'),
];

// Validate download token in query
const validateDownloadToken = [
	query('token')
		.notEmpty()
		.withMessage('Download token is required')
		.isJWT()
		.withMessage('Invalid token format'),
];

// Check validation errors and return response
const handleValidationErrors = (req, res, next) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			errors: errors.array().map((err) => ({
				field: err.path || err.param,
				message: err.msg,
			})),
		});
	}
	next();
};

// Sanitize query params - remove unexpected fields
const sanitizeQueryParams = (req, res, next) => {
	const allowedParams = [
		'courseId',
		'completionDateStart',
		'completionDateEnd',
		'issueDateStart',
		'issueDateEnd',
		'page',
		'limit',
		'token',
		'status',
	];

	if (req.query) {
		Object.keys(req.query).forEach((key) => {
			if (!allowedParams.includes(key)) {
				delete req.query[key];
			}
		});
	}

	next();
};

module.exports = {
	validateCertificateQuery,
	validateCertificateId,
	validateDownloadToken,
	handleValidationErrors,
	sanitizeQueryParams,
};
