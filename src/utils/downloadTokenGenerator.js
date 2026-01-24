const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const generateNonce = () => {
	return crypto.randomBytes(16).toString('hex');
};

// Generate token for single certificate download (default: 1 hour)
const generateDownloadToken = (certificateId, studentId, expiresIn = 3600) => {
	if (!certificateId || !studentId) {
		throw new Error('Certificate ID and Student ID are required');
	}

	const payload = {
		certificateId,
		studentId,
		type: 'certificate_download',
		nonce: generateNonce(),
		timestamp: Date.now(),
	};

	return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

// Verify single certificate download token
const verifyDownloadToken = (token) => {
	if (!token) {
		throw new Error('Token is required');
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);

		if (decoded.type !== 'certificate_download') {
			throw new Error('Invalid token type');
		}

		return decoded;
	} catch (error) {
		if (error.name === 'TokenExpiredError') {
			throw new Error('Download token has expired');
		}
		if (error.name === 'JsonWebTokenError') {
			throw new Error('Invalid download token');
		}
		throw error;
	}
};

// Generate token for bulk download (default: 2 hours)
const generateBulkDownloadToken = (studentId, certificateCount, expiresIn = 7200) => {
	if (!studentId) {
		throw new Error('Student ID is required');
	}

	const payload = {
		studentId,
		certificateCount: certificateCount || 0,
		type: 'bulk_download',
		nonce: generateNonce(),
		timestamp: Date.now(),
	};

	return jwt.sign(payload, JWT_SECRET, { expiresIn });
};
// Verify bulk download token

const verifyBulkDownloadToken = (token) => {
	if (!token) {
		throw new Error('Token is required');
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);

		if (decoded.type !== 'bulk_download') {
			throw new Error('Invalid token type');
		}

		return decoded;
	} catch (error) {
		if (error.name === 'TokenExpiredError') {
			throw new Error('Download token has expired');
		}
		if (error.name === 'JsonWebTokenError') {
			throw new Error('Invalid download token');
		}
		throw error;
	}
};
// Extract token from query params, headers, or Bearer token

const extractTokenFromRequest = (req) => {
	if (req.query && req.query.token) {
		return req.query.token;
	}

	if (req.headers['x-download-token']) {
		return req.headers['x-download-token'];
	}

	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	return null;
};

module.exports = {
	generateDownloadToken,
	verifyDownloadToken,
	generateBulkDownloadToken,
	verifyBulkDownloadToken,
	extractTokenFromRequest,
};
