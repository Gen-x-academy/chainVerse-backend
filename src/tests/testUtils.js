const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Connect to in-memory MongoDB server for testing
 */
exports.connectTestDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
};

/**
 * Disconnect and stop in-memory MongoDB server
 */
exports.disconnectTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

/**
 * Clear all collections in the test database
 */
exports.clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

/**
 * Create a test user with specified role
 */
exports.createTestUser = async (userData = {}) => {
  const User = require('../models/User');
  const defaultUser = {
    email: 'test@example.com',
    password: 'password123',
    fullName: 'Test User',
    role: 'student',
    isEmailVerified: true,
    ...userData
  };

  const user = new User(defaultUser);
  return await user.save();
};

/**
 * Generate JWT token for testing
 */
exports.generateTestToken = (user) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'testsecret',
    { expiresIn: '1h' }
  );
};
