import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReviewCourseDto } from './dto/review-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Course, CourseDocument } from './schemas/course.schema';

@Injectable()
export class AdminCourseService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
  ) {}

  async findAll() {
    const courses = await this.courseModel.find().exec();
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      tutorId: c.tutorId,
      enrolledCount: c.enrolledStudents.length,
      createdAt: c.createdAt,
    }));
  }

  async findOne(id: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(id).exec();
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return course;
  }

  async review(id: string, dto: ReviewCourseDto) {
    if (!dto.decision || !['approved', 'rejected'].includes(dto.decision)) {
      throw new BadRequestException('Decision must be "approved" or "rejected"');
    }

    if (dto.decision === 'rejected' && !dto.reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const course = await this.findOne(id);
    course.status = dto.decision;
    await course.save();

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

  async publish(id: string) {
    const course = await this.findOne(id);
    if (
      course.status !== 'approved' &&
      course.status !== 'unpublished'
    ) {
      throw new BadRequestException(
        'Only approved or unpublished courses can be published',
      );
    }
    course.status = 'published';
    await course.save();
    return { message: 'Course published', course };
  }

  async unpublish(id: string) {
    const course = await this.findOne(id);
    if (course.status !== 'published') {
      throw new BadRequestException('Only published courses can be unpublished');
    }
    course.status = 'unpublished';
    await course.save();
    return { message: 'Course unpublished', course };
  }

  async update(id: string, dto: UpdateCourseDto) {
    const course = await this.courseModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return course;
  }

  async delete(id: string) {
    const result = await this.courseModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return { message: 'Course deleted' };
  }

  async getEnrollments(id: string) {
    const course = await this.findOne(id);
    return {
      courseId: id,
      courseTitle: course.title,
      enrolledStudents: course.enrolledStudents,
      totalEnrolled: course.enrolledStudents.length,
    };
  }

  private sendEmail(to: string, subject: string, body: string) {
    console.log(`[Email] To: ${to} | Subject: ${subject} | Body: ${body}`);
  }
}
