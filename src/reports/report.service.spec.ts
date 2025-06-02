import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from './reports.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tutor } from '../entities/tutor.entity';
import { Course } from '../entities/course.entity';
import { Feedback } from '../entities/feedback.entity';
import { Student } from '../entities/student.entity';
import { Discussion } from '../entities/discussion.entity';
import { LearningMaterial } from '../entities/learning-material.entity';
import { Certificate } from '../entities/certificate.entity';

describe('ReportService', () => {
  let service: ReportService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: getRepositoryToken(Tutor), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Course), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(Feedback), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(Student), useValue: mockRepo },
        { provide: getRepositoryToken(Discussion), useValue: mockRepo },
        { provide: getRepositoryToken(LearningMaterial), useValue: mockRepo },
        { provide: getRepositoryToken(Certificate), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // You can add more tests like:
  // it('should return tutor report for valid tutor id', async () => { ... });
});
