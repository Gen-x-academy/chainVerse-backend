const mongoose = require('mongoose');
const Quiz = require('../models/Quiz'); // Ensure this path is correct
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
// Example data (customize as needed)
const quizzes = [
  {
    _id: uuidv4(),
    courseId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    moduleId: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
    title: 'Introduction to Node.js',
    description: 'A quiz covering Node.js basics, modules, and event loop.',
    questions: [
      {
        _id: uuidv4(),
        text: 'What is Node.js mainly used for?',
        explanation: 'Node.js is commonly used for server-side scripting.',
        options: [
          { _id: uuidv4(), text: 'Data analysis', isCorrect: false },
          { _id: uuidv4(), text: 'Server-side scripting', isCorrect: true },
          { _id: uuidv4(), text: 'Mobile app development', isCorrect: false },
        ]
      },
      {
        _id: uuidv4(),
        text: 'Which of the following is a core module in Node.js?',
        options: [
          { _id: uuidv4(), text: 'express', isCorrect: false },
          { _id: uuidv4(), text: 'http', isCorrect: true },
          { _id: uuidv4(), text: 'react', isCorrect: false },
        ]
      },
      {
        _id: uuidv4(),
        text: 'Node.js runs on which engine?',
        options: [
          { _id: uuidv4(), text: 'V8', isCorrect: true },
          { _id: uuidv4(), text: 'SpiderMonkey', isCorrect: false },
          { _id: uuidv4(), text: 'Java Virtual Machine', isCorrect: false },
        ]
      },
      {
        _id: uuidv4(),
        text: 'What method is used to read a file asynchronously in Node.js?',
        options: [
          { _id: uuidv4(), text: 'fs.readFile', isCorrect: true },
          { _id: uuidv4(), text: 'fs.openFile', isCorrect: false },
        ]
      },
      {
        _id: uuidv4(),
        text: 'Which statement best describes the event loop?',
        options: [
          { _id: uuidv4(), text: 'It blocks the thread until completion', isCorrect: false },
          { _id: uuidv4(), text: 'It allows non-blocking I/O operations', isCorrect: true },
        ]
      }
    ],
    createdBy: '123e4567-e89b-12d3-a456-426614174000',
    updatedBy: '123e4567-e89b-12d3-a456-426614174000',
    isActive: true,
    version: 1
  }
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Quiz.deleteMany({});
    await Quiz.insertMany(quizzes);
    console.log('Quiz seed completed!');
    process.exit();
  } catch (err) {
    console.error('Quiz seed failed:', err);
    process.exit(1);
  }
};

seed();
module.exports = seed;