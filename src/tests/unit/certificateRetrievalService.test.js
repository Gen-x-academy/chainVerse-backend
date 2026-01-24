const certificateRetrievalService = require('../../services/certificateRetrievalService');
const Certificate = require('../../models/certificate');
const Course = require('../../models/course');

jest.mock('../../models/certificate');
jest.mock('../../models/course');
jest.mock('../../utils/logger', () => ({
	info: jest.fn(),
	error: jest.fn(),
	warn: jest.fn(),
}));

describe('certificateRetrievalService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getMyCertificates', () => {
		const mockStudentId = '507f1f77bcf86cd799439011';
		const mockCertificates = [
			{
				_id: '507f1f77bcf86cd799439012',
				studentId: mockStudentId,
				courseId: { _id: '507f1f77bcf86cd799439013', title: 'Course 1' },
				issueDate: new Date('2024-01-15'),
				status: 'ACTIVE',
			},
			{
				_id: '507f1f77bcf86cd799439014',
				studentId: mockStudentId,
				courseId: { _id: '507f1f77bcf86cd799439015', title: 'Course 2' },
				issueDate: new Date('2024-02-20'),
				status: 'ACTIVE',
			},
		];

		it('should retrieve certificates with correct query', async () => {
			const mockFind = jest.fn().mockReturnThis();
			const mockPopulate = jest.fn().mockReturnThis();
			const mockSort = jest.fn().mockReturnThis();
			const mockSkip = jest.fn().mockReturnThis();
			const mockLimit = jest.fn().mockReturnThis();
			const mockLean = jest.fn().mockResolvedValue(mockCertificates);

			Certificate.find = mockFind;
			mockFind.mockReturnValue({
				populate: mockPopulate,
				sort: mockSort,
				skip: mockSkip,
				limit: mockLimit,
				lean: mockLean,
			});

			Certificate.countDocuments = jest.fn().mockResolvedValue(2);

			const result = await certificateRetrievalService.getMyCertificates(
				mockStudentId,
				{},
				{ page: 1, limit: 10 }
			);

			expect(mockFind).toHaveBeenCalledWith({
				studentId: mockStudentId,
				status: 'ACTIVE',
			});
			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(2);
			expect(result.pagination.totalCount).toBe(2);
		});

		it('should apply courseId filter correctly', async () => {
			const mockCourseId = '507f1f77bcf86cd799439013';
			const mockFind = jest.fn().mockReturnThis();
			const mockPopulate = jest.fn().mockReturnThis();
			const mockSort = jest.fn().mockReturnThis();
			const mockSkip = jest.fn().mockReturnThis();
			const mockLimit = jest.fn().mockReturnThis();
			const mockLean = jest.fn().mockResolvedValue([mockCertificates[0]]);

			Certificate.find = mockFind;
			mockFind.mockReturnValue({
				populate: mockPopulate,
				sort: mockSort,
				skip: mockSkip,
				limit: mockLimit,
				lean: mockLean,
			});

			Certificate.countDocuments = jest.fn().mockResolvedValue(1);

			await certificateRetrievalService.getMyCertificates(
				mockStudentId,
				{ courseId: mockCourseId },
				{ page: 1, limit: 10 }
			);

			expect(mockFind).toHaveBeenCalledWith({
				studentId: mockStudentId,
				courseId: mockCourseId,
				status: 'ACTIVE',
			});
		});

		it('should apply date range filters correctly', async () => {
			const mockFind = jest.fn().mockReturnThis();
			const mockPopulate = jest.fn().mockReturnThis();
			const mockSort = jest.fn().mockReturnThis();
			const mockSkip = jest.fn().mockReturnThis();
			const mockLimit = jest.fn().mockReturnThis();
			const mockLean = jest.fn().mockResolvedValue([]);

			Certificate.find = mockFind;
			mockFind.mockReturnValue({
				populate: mockPopulate,
				sort: mockSort,
				skip: mockSkip,
				limit: mockLimit,
				lean: mockLean,
			});

			Certificate.countDocuments = jest.fn().mockResolvedValue(0);

			const startDate = '2024-01-01';
			const endDate = '2024-12-31';

			await certificateRetrievalService.getMyCertificates(
				mockStudentId,
				{ startDate, endDate },
				{ page: 1, limit: 10 }
			);

			const callArgs = mockFind.mock.calls[0][0];
			expect(callArgs.issueDate.$gte).toEqual(new Date(startDate));
			expect(callArgs.issueDate.$lte).toEqual(new Date(endDate));
		});

		it('should calculate pagination correctly', async () => {
			const mockFind = jest.fn().mockReturnThis();
			const mockPopulate = jest.fn().mockReturnThis();
			const mockSort = jest.fn().mockReturnThis();
			const mockSkip = jest.fn().mockReturnThis();
			const mockLimit = jest.fn().mockReturnThis();
			const mockLean = jest.fn().mockResolvedValue([mockCertificates[0]]);

			Certificate.find = mockFind;
			mockFind.mockReturnValue({
				populate: mockPopulate,
				sort: mockSort,
				skip: mockSkip,
				limit: mockLimit,
				lean: mockLean,
			});

			Certificate.countDocuments = jest.fn().mockResolvedValue(25);

			const result = await certificateRetrievalService.getMyCertificates(
				mockStudentId,
				{},
				{ page: 2, limit: 10 }
			);

			expect(mockSkip).toHaveBeenCalledWith(10);
			expect(mockLimit).toHaveBeenCalledWith(10);
			expect(result.pagination.totalPages).toBe(3);
			expect(result.pagination.hasNextPage).toBe(true);
			expect(result.pagination.hasPrevPage).toBe(true);
		});

		it('should handle errors gracefully', async () => {
			Certificate.find = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				skip: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				lean: jest.fn().mockRejectedValue(new Error('Database error')),
			});

			await expect(
				certificateRetrievalService.getMyCertificates(mockStudentId, {}, {})
			).rejects.toThrow('Failed to retrieve certificates');
		});
	});

	describe('getSingleCertificate', () => {
		const mockStudentId = '507f1f77bcf86cd799439011';
		const mockCertificateId = '507f1f77bcf86cd799439012';

		it('should retrieve single certificate successfully', async () => {
			const mockCertificate = {
				_id: mockCertificateId,
				studentId: { _id: mockStudentId },
				courseId: { _id: '507f1f77bcf86cd799439013', title: 'Test Course' },
				status: 'ACTIVE',
			};

			Certificate.findById = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockResolvedValue(mockCertificate),
			});

			const result = await certificateRetrievalService.getSingleCertificate(
				mockCertificateId,
				mockStudentId
			);

			expect(Certificate.findById).toHaveBeenCalledWith(mockCertificateId);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			expect(result.data.downloadToken).toBeDefined();
		});

		it('should throw error when certificate not found', async () => {
			Certificate.findById = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockResolvedValue(null),
			});

			await expect(
				certificateRetrievalService.getSingleCertificate(
					mockCertificateId,
					mockStudentId
				)
			).rejects.toThrow('Certificate not found');
		});

		it('should verify ownership', async () => {
			const differentStudentId = '507f1f77bcf86cd799439099';
			const mockCertificate = {
				_id: mockCertificateId,
				studentId: { _id: mockStudentId },
				courseId: { _id: '507f1f77bcf86cd799439013' },
				status: 'ACTIVE',
			};

			Certificate.findById = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockResolvedValue(mockCertificate),
			});

			await expect(
				certificateRetrievalService.getSingleCertificate(
					mockCertificateId,
					differentStudentId
				)
			).rejects.toThrow('Unauthorized access to certificate');
		});
	});

	describe('getCertificateFilesForDownload', () => {
		const mockStudentId = '507f1f77bcf86cd799439011';

		it('should return array of certificate file information', async () => {
			const mockCertificates = [
				{
					_id: '507f1f77bcf86cd799439012',
					studentId: mockStudentId,
					courseId: { title: 'Blockchain Basics' },
					certificateUrl: 'https://example.com/cert1.pdf',
					issueDate: new Date(),
				},
				{
					_id: '507f1f77bcf86cd799439013',
					studentId: mockStudentId,
					courseId: { title: 'Smart Contracts' },
					imageUrl: 'https://example.com/cert2.png',
					issueDate: new Date(),
				},
			];

			Certificate.find = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockResolvedValue(mockCertificates),
			});

			const result = await certificateRetrievalService.getCertificateFilesForDownload(
				mockStudentId
			);

			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(2);
			expect(result.data[0].url).toBeDefined();
			expect(result.data[0].filename).toBeDefined();
			expect(result.data[0].filename).toContain('Blockchain_Basics');
		});

		it('should return empty array when no certificates found', async () => {
			Certificate.find = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockResolvedValue([]),
			});

			const result = await certificateRetrievalService.getCertificateFilesForDownload(
				mockStudentId
			);

			expect(result.success).toBe(true);
			expect(result.data).toHaveLength(0);
			expect(result.message).toContain('No certificates found');
		});

		it('should handle errors gracefully', async () => {
			Certificate.find = jest.fn().mockReturnValue({
				populate: jest.fn().mockReturnThis(),
				lean: jest.fn().mockRejectedValue(new Error('Database error')),
			});

			await expect(
				certificateRetrievalService.getCertificateFilesForDownload(mockStudentId)
			).rejects.toThrow('Failed to retrieve certificate files');
		});
	});

	describe('verifyCertificateOwnership', () => {
		const mockStudentId = '507f1f77bcf86cd799439011';
		const mockCertificateId = '507f1f77bcf86cd799439012';

		it('should return true when student owns certificate', async () => {
			Certificate.findOne = jest.fn().mockReturnValue({
				lean: jest.fn().mockResolvedValue({
					_id: mockCertificateId,
					studentId: mockStudentId,
				}),
			});

			const result = await certificateRetrievalService.verifyCertificateOwnership(
				mockCertificateId,
				mockStudentId
			);

			expect(Certificate.findOne).toHaveBeenCalledWith({
				_id: mockCertificateId,
				studentId: mockStudentId,
			});
			expect(result).toBe(true);
		});

		it('should return false when student does not own certificate', async () => {
			Certificate.findOne = jest.fn().mockReturnValue({
				lean: jest.fn().mockResolvedValue(null),
			});

			const result = await certificateRetrievalService.verifyCertificateOwnership(
				mockCertificateId,
				mockStudentId
			);

			expect(result).toBe(false);
		});

		it('should throw error on database error', async () => {
			Certificate.findOne = jest.fn().mockReturnValue({
				lean: jest.fn().mockRejectedValue(new Error('Database error')),
			});

			await expect(
				certificateRetrievalService.verifyCertificateOwnership(
					mockCertificateId,
					mockStudentId
				)
			).rejects.toThrow('Failed to verify certificate ownership');
		});

		it('should throw error when certificateId is missing', async () => {
			await expect(
				certificateRetrievalService.verifyCertificateOwnership(null, mockStudentId)
			).rejects.toThrow('Certificate ID and Student ID are required');
		});

		it('should throw error when studentId is missing', async () => {
			await expect(
				certificateRetrievalService.verifyCertificateOwnership(
					mockCertificateId,
					null
				)
			).rejects.toThrow('Certificate ID and Student ID are required');
		});
	});
});
