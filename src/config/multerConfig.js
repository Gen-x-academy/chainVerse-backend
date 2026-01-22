const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/profile-images');
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
		const ext = path.extname(file.originalname);
		cb(null, `profile-${req.user._id}-${uniqueSuffix}${ext}`);
	},
});

// File filter
const fileFilter = (req, file, cb) => {
	// Check file type
	const allowedFileTypes = /jpeg|jpg|png|webp/;
	const extname = allowedFileTypes.test(
		path.extname(file.originalname).toLowerCase()
	);
	const mimetype = allowedFileTypes.test(file.mimetype);

	if (extname && mimetype) {
		return cb(null, true);
	} else {
		cb(new Error('Only .jpeg, .jpg, .png and .webp files are allowed!'), false);
	}
};

// Create Multer instance
const uploadProfileImage = multer({
	storage: storage,
	limits: {
		fileSize: 2 * 1024 * 1024, // 2MB limit
	},
	fileFilter,
});

module.exports = { uploadProfileImage };
