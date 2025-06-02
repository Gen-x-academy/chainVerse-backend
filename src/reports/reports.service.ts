import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tutor } from '../entities/tutor.entity';
import { Course } from '../entities/course.entity';
import { Feedback } from '../entities/feedback.entity';
import { Student } from '../entities/student.entity';
import { Discussion } from '../entities/discussion.entity';
import { LearningMaterial } from '../entities/learning-material.entity';
import { Certificate } from '../entities/certificate.entity';

@Injectable()
export class ReportService {
  getAllTutorSummaries: any;
  constructor(
    @InjectRepository(Tutor) private readonly tutorRepo: Repository<Tutor>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(Feedback) private readonly feedbackRepo: Repository<Feedback>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(Discussion) private readonly discussionRepo: Repository<Discussion>,
    @InjectRepository(LearningMaterial) private readonly materialRepo: Repository<LearningMaterial>,
    @InjectRepository(Certificate) private readonly certificateRepo: Repository<Certificate>,
  ) {}

  async getTutorReport(tutorId: string) {
    const tutor = await this.tutorRepo.findOne({ where: { id: tutorId } });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const courses = await this.courseRepo.find({
      where: { tutor: { id: tutorId } },
      relations: ['students'],
    });

    const completedCourses = courses.filter(course => course.status === 'completed');
    const studentsTaught = courses.reduce((sum, course) => sum + course.students.length, 0);

    const feedbacks = await this.feedbackRepo.find({
      where: { tutor: { id: tutorId } },
    });

    const avgRating = feedbacks.length
      ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length
      : null;

    const discussionsCount = await this.discussionRepo.count({
      where: { tutor: { id: tutorId } },
    });

    const materialsCount = await this.materialRepo.count({
      where: { tutor: { id: tutorId } },
    });

    const certificatesCount = await this.certificateRepo.count({
      where: { tutor: { id: tutorId } },
    });

    return {
      tutorId,
      tutorName: tutor.name,
      assignedCourses: courses.length,
      completedCourses: completedCourses.length,
      studentsTaught,
      avgRating,
      discussionsCount,
      materialsCount,
      certificatesCount,
    };
  }
}
