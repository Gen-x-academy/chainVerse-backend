const mongoose = require('mongoose');
const dotEnv = require('dotenv');
// dotEnv.config({ path: './env' });
dotEnv.config({ path: './config.env' });

const connectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		console.log('MongoDB connected successfully');
	} catch (error) {
		console.error('MongoDB connection error:', error.message);
		process.exit(1);
	}
};

module.exports = connectDB;
