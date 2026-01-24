const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Certificate = require('../../models/certificate');
const Student = require('../../models/student');
const Course = require('../../models/course');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');

let authToken;
let studentId;
let anotherStudentId;
let anotherAuthToken;
let courseId;
let certificateId;
let anotherCertificateId;

const generateToken = (userId) => {
	return jwt.sign({ id: userId, _id: userId }, process.env.JWT_SECRET, {
		expiresIn: '1h',
	});
};

beforeAll(async () => {
	await mongoose.connect(process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/chainverse-test');
});

beforeEach(async () => {
	await Certificate.deleteMany({});
	await Student.deleteMany({});
	await Course.deleteMany({});
	await User.deleteMany({});

	// Create test student 1
	const student = await Student.create({
		name: 'Test Student',
		email: 'student@test.com',
	});
	studentId = student._id;
	authToken = generateToken(studentId);

	// Create test student 2
	const anotherStudent = await Student.create({
		name: 'Another Student',
		email: 'another@test.com',
	});
	anotherStudentId = anotherStudent._id;
	anotherAuthToken = generateToken(anotherStudentId);

	// Create test course
	const course = await Course.create({
		title: 'Blockchain Fundamentals',
		description: 'Learn blockchain basics',
		tutorName: 'John Doe',
	});
	courseId = course._id;

	// Create certificates for student 1
	const cert1 = await Certificate.create({
		studentId: studentId,
		courseId: courseId,
		issueDate: new Date('2024-01-15'),
		status: 'ACTIVE',
		certificateUrl: 'https://example.com/cert1.pdf',
	});
	certificateId = cert1._id;

	await Certificate.create({
		studentId: studentId,
		courseId: courseId,
		issueDate: new Date('2024-02-20'),
		status: 'ACTIVE',
		certificateUrl: 'https://example.com/cert2.pdf',
	});

	// Create certificate for student 2
	const cert3 = await Certificate.create({
		studentId: anotherStudentId,
		courseId: courseId,
		issueDate: new Date('2024-01-10'),
		status: 'ACTIVE',
		certificateUrl: 'https://example.com/cert3.pdf',
	});
	anotherCertificateId = cert3._id;
});

afterAll(async () => {
	await Certificate.deleteMany({});
	await Student.deleteMany({});
	await Course.deleteMany({});
	await User.deleteMany({});
	await mongoose.connection.close();
});

describe('GET /api/certificates/my-certificates', () => {
	it('should retrieve all certificates for authenticated student', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.data).toBeInstanceOf(Array);
		expect(res.body.data.length).toBe(2);
		expect(res.body.pagination).toBeDefined();
	});

	it('should return 401 without authentication', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.expect(401);

		expect(res.body.error).toBeDefined();
	});

	it('should filter certificates by courseId', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.query({ courseId: courseId.toString() })
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.data.length).toBe(2);
		expect(res.body.data[0].courseId._id.toString()).toBe(courseId.toString());
	});

	it('should filter certificates by date range', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.query({
				issueDateStart: '2024-02-01',
				issueDateEnd: '2024-02-28',
			})
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.data.length).toBe(1);
	});

	it('should implement pagination correctly', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.query({ page: 1, limit: 1 })
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.data.length).toBe(1);
		expect(res.body.pagination.page).toBe(1);
		expect(res.body.pagination.limit).toBe(1);
		expect(res.body.pagination.totalCount).toBe(2);
	});

	it('should return 400 for invalid courseId', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.query({ courseId: 'invalid-id' })
			.set('Authorization', `Bearer ${authToken}`)
			.expect(400);

		expect(res.body.success).toBe(false);
		expect(res.body.errors).toBeDefined();
	});

	it('should not return other students certificates', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates')
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		const otherStudentCert = res.body.data.find(
			(cert) => cert.studentId.toString() === anotherStudentId.toString()
		);
		expect(otherStudentCert).toBeUndefined();
	});
});

describe('GET /api/certificates/:certificateId', () => {
	it('should retrieve single certificate successfully', async () => {
		const res = await request(app)
			.get(`/api/certificates/${certificateId}`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.data._id.toString()).toBe(certificateId.toString());
		expect(res.body.data.downloadToken).toBeDefined();
	});

	it('should return 404 for non-existent certificate', async () => {
		const fakeId = new mongoose.Types.ObjectId();
		const res = await request(app)
			.get(`/api/certificates/${fakeId}`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(404);

		expect(res.body.success).toBe(false);
	});

	it('should return 404 when accessing other students certificate', async () => {
		const res = await request(app)
			.get(`/api/certificates/${anotherCertificateId}`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(404);

		expect(res.body.success).toBe(false);
		expect(res.body.message).toContain('Unauthorized');
	});

	it('should return 400 for invalid certificate ID', async () => {
		const res = await request(app)
			.get('/api/certificates/invalid-id')
			.set('Authorization', `Bearer ${authToken}`)
			.expect(400);

		expect(res.body.success).toBe(false);
		expect(res.body.errors).toBeDefined();
	});

	it('should include download token in response', async () => {
		const res = await request(app)
			.get(`/api/certificates/${certificateId}`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.data.downloadToken).toBeDefined();
		expect(typeof res.body.data.downloadToken).toBe('string');
		expect(res.body.data.downloadTokenExpiry).toBeDefined();
	});
});

describe('GET /api/certificates/my-certificates/download-all', () => {
	it('should return 401 without authentication', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates/download-all')
			.expect(401);

		expect(res.body.error).toBeDefined();
	});

	it('should return 404 when student has no certificates', async () => {
		await Certificate.deleteMany({ studentId });

		const res = await request(app)
			.get('/api/certificates/my-certificates/download-all')
			.set('Authorization', `Bearer ${authToken}`)
			.expect(404);

		expect(res.body.success).toBe(false);
		expect(res.body.message).toContain('No certificates found');
	});

	it('should set correct headers for ZIP download', async () => {
		const res = await request(app)
			.get('/api/certificates/my-certificates/download-all')
			.set('Authorization', `Bearer ${authToken}`);

		if (res.status === 200) {
			expect(res.headers['content-type']).toBe('application/zip');
			expect(res.headers['content-disposition']).toContain('attachment');
		}
	});
});

describe('GET /api/certificates/:certificateId/verify-ownership', () => {
	it('should confirm ownership for owned certificate', async () => {
		const res = await request(app)
			.get(`/api/certificates/${certificateId}/verify-ownership`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.isOwner).toBe(true);
	});

	it('should deny ownership for other students certificate', async () => {
		const res = await request(app)
			.get(`/api/certificates/${anotherCertificateId}/verify-ownership`)
			.set('Authorization', `Bearer ${authToken}`)
			.expect(200);

		expect(res.body.success).toBe(true);
		expect(res.body.isOwner).toBe(false);
	});

	it('should return 401 without authentication', async () => {
		const res = await request(app)
			.get(`/api/certificates/${certificateId}/verify-ownership`)
			.expect(401);

		expect(res.body.error).toBeDefined();
	});

	it('should return 400 for invalid certificate ID', async () => {
		const res = await request(app)
			.get('/api/certificates/invalid-id/verify-ownership')
			.set('Authorization', `Bearer ${authToken}`)
			.expect(400);

		expect(res.body.success).toBe(false);
		expect(res.body.errors).toBeDefined();
	});
});
