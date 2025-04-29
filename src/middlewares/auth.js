const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
	let token;

	// Check Authorization header
	if (
		req.header('Authorization') &&
		req.header('Authorization').startsWith('Bearer ')
	) {
		token = req.header('Authorization').split(' ')[1];
	}
	// Fallback: Check x-auth-token
	else if (req.header('x-auth-token')) {
		token = req.header('x-auth-token');
	}

	// No token at all
	if (!token) {
		return res.status(401).json({ msg: 'No token, authorization denied' });
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		req.user = decoded;
		next();
	} catch (err) {
		res.status(401).json({ msg: 'Token is not valid' });
	}
};

// const jwt = require("jsonwebtoken")
// const User = require("../models/user")

// /**
//  * Authenticate middleware to verify JWT token
//  */
// exports.authenticate = async (req, res, next) => {
//   try {
//     // Get token from Authorization header
//     const authHeader = req.headers.authorization

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return res.status(401).json({ error: "Authentication required" })
//     }

//     const token = authHeader.split(" ")[1]

//     // Verify token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET)

//     // Find user
//     const user = await User.findById(decoded.id).select("-password")

//     if (!user) {
//       return res.status(401).json({ error: "User not found" })
//     }

//     // Attach user to request
//     req.user = user
//     next()
//   } catch (error) {
//     console.error("Authentication error:", error)
//     return res.status(401).json({ error: "Authentication failed" })
//   }
// }
