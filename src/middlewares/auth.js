const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');
require('dotenv').config();

// Cache user data for 5 minutes
const userCache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

// Validate JWT token format
const isValidJWT = (token) => {
	const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
	return jwtRegex.test(token);
};

const handleError = (res, statusCode, message) => {
	return res.status(statusCode).json({ error: message });
};

/**
 * Authentication middleware
 * Verifies JWT token, loads user from DB, attaches user to req
 */
exports.authenticate = async (req, res, next) => {
	try {
		// Extract and validate auth header
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith('Bearer ')) {
			return handleError(res, 401, 'Access denied, no token provided');
		}

		const token = authHeader.split(' ')[1];
		if (!token || !isValidJWT(token)) {
			return handleError(res, 401, 'Invalid token format');
		}

		// Verify JWT token
		let decoded;
		try {
			decoded = jwt.verify(token, process.env.JWT_SECRET);
		} catch (err) {
			const errorMessages = {
				JsonWebTokenError: 'Invalid token',
				TokenExpiredError: 'Token expired',
				NotBeforeError: 'Token not yet active',
			};
			return handleError(
				res,
				401,
				errorMessages[err.name] || 'Token validation failed'
			);
		}

		// Check cache first
		const userId = decoded.id || decoded.sub || decoded._id;
		let user = userCache.get(userId);
		if (!user) {
			user = await User.findById(userId).select('+role').lean();
			if (!user) {
				return handleError(res, 401, 'User not found');
			}
			userCache.set(userId, user);
		}

		// Attach user to request
		req.user = user;
		next();
	} catch (error) {
		logger.error(`Authentication error: ${error.message}`);
		return handleError(res, 500, 'Internal server error');
	}
};

/**
 * Check if user is admin
 */
exports.isAdmin = (user) => {
	return Boolean(user?.role === 'admin');
};

/**
 * Check if user is staff
 */
exports.isStaff = (user) => {
	return Boolean(user?.role === 'staff');
};

/**
 * Middleware to check if user is admin or staff
 */
exports.isAdminOrStaff = (req, res, next) => {
	try {
		if (!req.user) {
			return handleError(res, 401, 'Authentication required');
		}

		if (req.user.role !== 'admin' && req.user.role !== 'staff') {
			return handleError(
				res,
				403,
				'Access denied. Admin or staff role required'
			);
		}

		next();
	} catch (error) {
		logger.error(`Authorization error: ${error.message}`);
		return handleError(res, 500, 'Internal server error');
	}
};

/**
 * Role-based access control middleware
 * @param {Array} roles - allowed roles array
 */
exports.hasRole = (roles = []) => {
	return (req, res, next) => {
		// Validate roles array
		if (!Array.isArray(roles) || roles.length === 0) {
			throw new Error('Invalid roles configuration');
		}
		if (!req.user) {
			return handleError(res, 401, 'Unauthorized');
		}

		if (!roles.includes(req.user.role)) {
			return handleError(res, 403, 'Forbidden');
		}

		next();
	};
};
