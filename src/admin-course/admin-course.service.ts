import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewCourseDto } from './dto/review-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  thumbnailUrl: string;
  tutorId: string;
  tutorEmail: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'unpublished';
  enrolledStudents: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface EmailLog {
  to: string;
  subject: string;
  body: string;
  sentAt: Date;
}

@Injectable()
export class AdminCourseService {
  private readonly courses: Course[] = [];
  private readonly emailLogs: EmailLog[] = [];

  findAll() {
    return this.courses.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      tutorId: c.tutorId,
      enrolledCount: c.enrolledStudents.length,
      createdAt: c.createdAt,
    }));
  }

  findOne(id: string) {
    const course = this.courses.find((c) => c.id === id);
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return course;
  }

  review(id: string, dto: ReviewCourseDto) {
    if (!dto.decision || !['approved', 'rejected'].includes(dto.decision)) {
      throw new BadRequestException('Decision must be "approved" or "rejected"');
    }

    if (dto.decision === 'rejected' && !dto.reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const course = this.findOne(id);
    course.status = dto.decision;
    course.updatedAt = new Date();

    if (dto.decision === 'approved') {
      this.sendEmail(
        course.tutorEmail,
        'Course Approved',
        `Your course "${course.title}" has been approved and is ready to be published.`,
      );
    } else {
      this.sendEmail(
        course.tutorEmail,
        'Course Rejected',
        `Your course "${course.title}" has been rejected. Reason: ${dto.reason}`,
      );
    }

    return { message: `Course ${dto.decision}`, course };
  }

  publish(id: string) {
    const course = this.findOne(id);
    if (course.status !== 'approved' && course.status !== 'unpublished') {
      throw new BadRequestException('Only approved or unpublished courses can be published');
    }
    course.status = 'published';
    course.updatedAt = new Date();
    return { message: 'Course published', course };
  }

  unpublish(id: string) {
    const course = this.findOne(id);
    if (course.status !== 'published') {
      throw new BadRequestException('Only published courses can be unpublished');
    }
    course.status = 'unpublished';
    course.updatedAt = new Date();
    return { message: 'Course unpublished', course };
  }

  update(id: string, dto: UpdateCourseDto) {
    const course = this.findOne(id);

    if (dto.title !== undefined) course.title = dto.title;
    if (dto.description !== undefined) course.description = dto.description;
    if (dto.category !== undefined) course.category = dto.category;
    if (dto.tags !== undefined) course.tags = dto.tags;
    if (dto.price !== undefined) course.price = dto.price;
    if (dto.thumbnailUrl !== undefined) course.thumbnailUrl = dto.thumbnailUrl;

    course.updatedAt = new Date();
    return course;
  }

  delete(id: string) {
    const index = this.courses.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    this.courses.splice(index, 1);
    return { message: 'Course deleted' };
  }

  getEnrollments(id: string) {
    const course = this.findOne(id);
    return {
      courseId: id,
      courseTitle: course.title,
      enrolledStudents: course.enrolledStudents,
      totalEnrolled: course.enrolledStudents.length,
    };
  }

  private sendEmail(to: string, subject: string, body: string) {
    this.emailLogs.push({ to, subject, body, sentAt: new Date() });
    console.log(`[Email] To: ${to} | Subject: ${subject}`);
  }
}
