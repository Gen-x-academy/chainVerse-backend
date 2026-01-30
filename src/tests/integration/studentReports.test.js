// tests/studentReports.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Certificate = require('../models/Certificate');
const StudyGroup = require('../models/StudyGroup');
const { generateToken } = require('../utils/tokenHelper');

const adminUser = {
  _id: new mongoose.Types.ObjectId(),
  email: 'admin@test.com',
  role: 'admin'
};

const advisorUser = {
  _id: new mongoose.Types.ObjectId(),
  email: 'advisor@test.com',
  role: 'academic_advisor'
};

const adminToken = generateToken(adminUser);
const advisorToken = generateToken(advisorUser);

let student1;
let student2;
let course1;
let course2;
let certificate;
let studyGroup;

describe('Student Reports API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    await Student.deleteMany({});
    await Course.deleteMany({});
    await Certificate.deleteMany({});
    await StudyGroup.deleteMany({});
    
    course1 = await Course.create({
      title: 'Introduction to JavaScript',
      description: 'Learn the basics of JavaScript programming'
    });
    
    course2 = await Course.create({
      title: 'Advanced React',
      description: 'Master React and Redux'
    });
    
    const student1Progress = new Map();
    student1Progress.set(course1._id.toString(), 100);
    student1Progress.set(course2._id.toString(), 50);
    
    const student1CompletionDates = new Map();
    student1CompletionDates.set(course1._id.toString(), new Date());
    
    const student1QuizResults = new Map();
    const course1Quizzes = new Map();
    course1Quizzes.set('quiz1', 85);
    course1Quizzes.set('quiz2', 90);
    student1QuizResults.set(student1._id.toString(), course1Quizzes);
    
    await Course.findByIdAndUpdate(course1._id, {
      studentProgress: student1Progress,
      completionDates: student1CompletionDates,
      quizResults: student1QuizResults
    });
    
    student1 = await Student.create({
      name: 'Jane Doe',
      email: 'jane@example.com',
      enrolledCourses: [course1._id, course2._id],
      completedCourses: [course1._id],
      financialAid: {
        status: 'approved',
        details: 'Full scholarship',
        approvalDate: new Date()
      }
    });
    
    student2 = await Student.create({
      name: 'John Smith',
      email: 'john@example.com',
      enrolledCourses: [course2._id],
      completedCourses: [],
      financialAid: {
        status: 'none'
      }
    });
    
    certificate = await Certificate.create({
      studentId: student1._id,
      courseId: course1._id,
      courseName: 'Introduction to JavaScript',
      issueDate: new Date(),
      shared: true,
      url: 'https://example.com/cert/123'
    });
    
    studyGroup = await StudyGroup.create({
      name: 'React Study Group',
      courseId: course2._id,
      members: [student1._id, student2._id]
    });
  });
  
  afterAll(async () => {
    await mongoose.connection.close();
  });
  
  describe('GET /reports/student/:studentId', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get(`/reports/student/${student1._id}`);
      expect(res.statusCode).toEqual(401);
    });
    
    it('should return 403 if not admin or academic advisor', async () => {
      const userToken = generateToken({ _id: new mongoose.Types.ObjectId(), role: 'student' });
      const res = await request(app)
        .get(`/reports/student/${student1._id}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toEqual(403);
    });
    
    it('should return 404 if student not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/reports/student/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(404);
    });
    
    it('should return student report for admin', async () => {
      const res = await request(app)
        .get(`/reports/student/${student1._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body.data).toHaveProperty('studentInfo');
      expect(res.body.data).toHaveProperty('academicProgress');
      expect(res.body.data).toHaveProperty('performance');
      expect(res.body.data).toHaveProperty('engagement');
      expect(res.body.data).toHaveProperty('support');
      
      expect(res.body.data.studentInfo.email).toEqual(student1.email);
      expect(res.body.data.academicProgress.enrolledCourses).toEqual(2);
      expect(res.body.data.academicProgress.completedCourses).toEqual(1);
      expect(res.body.data.support.financialAid.status).toEqual('approved');
    });
    
    it('should return student report for academic advisor', async () => {
      const res = await request(app)
        .get(`/reports/student/${student1._id}`)
        .set('Authorization', `Bearer ${advisorToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
    });
  });
  
  describe('GET /reports/students', () => {
    it('should return 401 if not authenticated', async () => {
      const res = await request(app).get('/reports/students');
      expect(res.statusCode).toEqual(401);
    });
    
    it('should return 403 if not admin or academic advisor', async () => {
      const userToken = generateToken({ _id: new mongoose.Types.ObjectId(), role: 'student' });
      const res = await request(app)
        .get('/reports/students')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toEqual(403);
    });
    
    it('should return all students with summary', async () => {
      const res = await request(app)
        .get('/reports/students')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBeTruthy();
      expect(res.body).toHaveProperty('pagination');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.length).toEqual(2);
      
      const jane = res.body.data.find(s => s.email === 'jane@example.com');
      expect(jane.summary.enrolledCourses).toEqual(2);
      expect(jane.summary.completedCourses).toEqual(1);
      expect(jane.summary.certificatesEarned).toEqual(1);
      expect(jane.summary.financialAidStatus).toEqual('approved');
    });
    
    it('should filter students by courseId', async () => {
      const res = await request(app)
        .get(`/reports/students?courseId=${course2._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(2); 
    });
    
    it('should filter students by completionStatus', async () => {
      const res = await request(app)
        .get(`/reports/students?courseId=${course1._id}&completionStatus=completed`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(1); 
      expect(res.body.data[0].email).toEqual('jane@example.com');
    });
    
    it('should handle pagination', async () => {
      const res = await request(app)
        .get('/reports/students?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(1);
      expect(res.body.pagination.total).toEqual(2);
      expect(res.body.pagination.pages).toEqual(2);
    });
  });
});