const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const enable2FA = async (req, res) => {
	try {
		const userId = req.user._id;
		const user = await User.findById(userId);

		if (!user) {
			return res.status(400).json({ msg: 'user does not exist' });
		}

		const secret = speakeasy.generateSecret({
			name: `ChainVerse (${user.email})`,
		});

		user.twoFASecret = secret.base32;
		await user.save();

		const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);
		return res.json({
			qrCode: qrCodeDataURL,
			manualEntryKey: secret.base32,
		});
	} catch (error) {
		return res.status(500).json({ message: 'Internal server error.' });
	}
};

const verify2FA = async (req, res) => {
	const { code } = req.body;
	if (!code) {
		return res.status(400).json({ message: 'Code is required.' });
	}
	const userId = req.user._id;
	const user = await User.findById(userId);

	const verified = speakeasy.totp.verify({
		secret: user.temp2FASecret,
		encoding: 'base32',
		token: code,
	});

	if (!verified) {
		return res.status(400).json({ message: 'Invalid 2FA code.' });
	}

	user.twoFASecret = user.twoFASecrete;
	user.is2FAEnabled = true;
	await user.save();

	return res.json({ message: '2FA has been enabled successfully.' });
};

const disable2FA = async (req, res) => {
	try {
		const { password } = req.body;

		if (!password) {
			return res.status(400).json({ message: 'Password is required.' });
		}
		const userId = req.user._id;
		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({ message: 'User not found.' });
		}

		const isPasswordValid = await bcrypt.compare(password, user.password);
		if (!isPasswordValid) {
			return res.status(401).json({ message: 'Invalid password.' });
		}

		user.twoFASecret = null;
		user.is2FAEnabled = false;
		await user.save();

		return res.json({ message: '2FA has been disabled successfully.' });
	} catch (error) {
		console.error('Disable 2FA Error:', error);
		return res.status(500).json({ message: 'Internal server error.' });
	}
};

module.exports = {
	enable2FA,
	verify2FA,
	disable2FA,
};
