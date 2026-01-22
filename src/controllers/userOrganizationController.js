const User = require('../models/User');
const {
	isValidEmail,
	isValidPhoneNumber,
	validatePassword,
	triggerEmailVerification,
} = require('../utils/fieldValidation');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/sendMail');

/**
 * @desc    Register a new user
 * @route   POST /organization/profile
 * @access  Public
 * @param   {object} req.body - email, password
 */
exports.registerUser = async (req, res) => {
	try {
		const { email, password } = req.body;

		// Validate required fields
		if (!email || !password) {
			return res.status(400).json({
				success: false,
				message: 'Email and password are required',
			});
		}

		// Validate email format
		if (!isValidEmail(email)) {
			return res.status(400).json({
				success: false,
				message: 'Invalid email format',
			});
		}

		// Check if user already exists
		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).json({
				success: false,
				message: 'User with this email already exists',
			});
		}

		// Validate password complexity
		const passwordValidation = validatePassword(password);
		if (!passwordValidation.isValid) {
			return res.status(400).json({
				success: false,
				message: passwordValidation.message,
			});
		}

		// Create new user
		const user = new User({
			email,
			password,
			isEmailVerified: false,
		});

		await user.save();

		// Generate JWT token
		const token = jwt.sign(
			{ _id: user._id, email: user.email },
			process.env.JWT_SECRET,
			{ expiresIn: '7d' }
		);

		// Trigger email verification
		// await sendEmail(email, user._id, 'ChainVerse: Verify Your Email');

		res.status(201).json({
			success: true,
			message: 'User registered successfully. Please verify your email.',
			data: {
				_id: user._id,
				email: user.email,
				isEmailVerified: user.isEmailVerified,
			},
			token,
		});
	} catch (error) {
		console.error('Error registering user:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
};

/**
 * @desc    Get user profile details
 * @route   GET /organization/profile
 * @access  Private
 */
exports.getProfile = async (req, res) => {
	try {
		// Get user details excluding password
		const user = await User.findById(req.user._id).select('-password');

		if (!user) {
			return res
				.status(404)
				.json({ success: false, message: 'User not found' });
		}

		res.status(200).json({
			success: true,
			data: user,
		});
	} catch (error) {
		console.error('Error getting profile:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
};

exports.verifyEmail = async (req, res) => {
	const userId = req.user._id;

	try {
		const user = await User.findById(userId);
		if (!user) {
			return res.status(404).send('User not found');
		}

		if (user.isEmailVerified) {
			return res.send('Email already verified.');
		}

		user.isEmailVerified = true;
		await user.save();

		res.send('Email successfully verified!');
	} catch (err) {
		console.error('Verification error:', err);
		res.status(500).send('Something went wrong during verification.');
	}
};

/**
 * @desc    Update user profile details
 * @route   PUT /organization/profile/update
 * @access  Private
 * @param   {object} req.body - fullName, email, phoneNumber, position
 */
exports.updateProfile = async (req, res) => {
	try {
		const { fullName, email, phoneNumber, position } = req.body;
		const updateFields = {};

		// Build update object with validated fields
		if (fullName) updateFields.fullName = fullName;
		if (position) updateFields.position = position;

		// Validating email if provided
		if (email) {
			if (!isValidEmail(email)) {
				return res.status(400).json({
					success: false,
					message: 'Invalid email format',
				});
			}

			// Checking if email is already in use by another user
			const existingUserWithEmail = await User.findOne({
				email,
				_id: { $ne: req.user._id },
			});
			if (existingUserWithEmail) {
				return res.status(400).json({
					success: false,
					message: 'Email is already in use',
				});
			}

			// Setting isEmailVerified to false if email is updated
			if (email !== req.user.email) {
				updateFields.email = email;
				updateFields.isEmailVerified = false;
			}
		}

		// Validate phone number if provided
		if (phoneNumber) {
			if (!isValidPhoneNumber(phoneNumber)) {
				return res.status(400).json({
					success: false,
					message: 'Invalid phone number format',
				});
			}
			updateFields.phoneNumber = phoneNumber;
		}

		// Update user profile
		const updatedUser = await User.findByIdAndUpdate(
			req.user._id,
			{ $set: updateFields },
			{ new: true, runValidators: true }
		).select('-password');

		// Trigger email verification if email was changed
		if (updateFields.email) {
			verificationLink = `${process.env.BASE_URL}/organization/profile/verify-email/${req.user._id}`;
			let message = `Click the link below to verify your email <br /> <a href="${verificationLink}">Verify Email</a>`;
			await sendEmail(
				updateFields.email,
				req.user._id,
				'ChainVerse: Email Update Verification',
				message
			);
		}

		res.status(200).json({
			success: true,
			data: updatedUser,
			message: updateFields.email
				? `Profile updated successfully. Please check your email inbox, and verify your email`
				: 'Profile updated successfully',
		});
	} catch (error) {
		console.error('Error updating profile:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
};

/**
 * @desc    Change user password
 * @route   PUT /organization/profile/change-password
 * @access  Private
 * @param   {object} req.body - currentPassword, newPassword
 */
exports.changePassword = async (req, res) => {
	try {
		const { currentPassword, newPassword } = req.body;

		// Validate required fields
		if (!currentPassword || !newPassword) {
			return res.status(400).json({
				success: false,
				message: 'Current password and new password are required',
			});
		}

		// Get user with password
		const user = await User.findById(req.user._id);
		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'User not found',
			});
		}

		// Verify current password
		const isMatch = await user.comparePassword(currentPassword);
		if (!isMatch) {
			return res.status(401).json({
				success: false,
				message: 'Current password is incorrect',
			});
		}

		// Validate new password complexity
		const passwordValidation = validatePassword(newPassword);
		if (!passwordValidation.isValid) {
			return res.status(400).json({
				success: false,
				message: passwordValidation.message,
			});
		}

		// Update password
		user.password = newPassword;
		await user.save();

		res.status(200).json({
			success: true,
			message: 'Password changed successfully',
		});
	} catch (error) {
		console.error('Error changing password:', error);
		res.status(500).json({
			success: false,
			message: 'Server error',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
};

/**
 * @desc    Upload profile image
 * @route   POST /organization/profile/upload-image
 * @access  Private
 * @param   {file} req.file - Profile image
 */
exports.uploadProfileImage = async (req, res) => {
	try {
		// Check if file exists
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: 'Please upload a file',
			});
		}

		// Get user
		const user = await User.findById(req.user._id);
		if (!user) {
			// Remove uploaded file if user not found
			fs.unlinkSync(req.file.path);
			return res.status(404).json({
				success: false,
				message: 'User not found',
			});
		}

		// Delete previous profile image if exists
		if (user.profileImage) {
			const previousImagePath = path.join(__dirname, '..', user.profileImage);
			if (fs.existsSync(previousImagePath)) {
				fs.unlinkSync(previousImagePath);
			}
		}

		// Set relative path for database storage
		const relativeFilePath = `/uploads/profile-images/${path.basename(
			req.file.path
		)}`;

		// Update user with new profile image path
		user.profileImage = relativeFilePath;
		await user.save();

		res.status(200).json({
			success: true,
			data: {
				profileImage: relativeFilePath,
			},
			message: 'Profile image uploaded successfully',
		});
	} catch (error) {
		console.error('Error uploading profile image:', error);

		// Clean up file if there was an error
		if (req.file) {
			fs.unlinkSync(req.file.path);
		}

		res.status(500).json({
			success: false,
			message: 'Server error',
			error: process.env.NODE_ENV === 'development' ? error.message : undefined,
		});
	}
};
