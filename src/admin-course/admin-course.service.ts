import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ReviewCourseDto } from './dto/review-course.dto';
import { Course, CourseDocument } from './schemas/course.schema';
import { DomainEvents } from '../events/event-names';

@Injectable()
export class AdminCourseService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new course (for tutors)
   */
  async create(
    dto: CreateCourseDto,
    tutorId: string,
    tutorEmail: string,
    tutorName: string,
  ): Promise<CourseDocument> {
    const course = await new this.courseModel({
      ...dto,
      tutorId,
      tutorEmail,
      tutorName,
      status: 'draft',
      curriculum: dto.curriculum || [],
    }).save();

    // Update tutor's course count
    await this.updateTutorStats(tutorId, 1);

    this.eventEmitter.emit('course.created', {
      courseId: course.id,
      tutorId,
      tutorEmail,
      title: course.title,
    });

    return course;
  }

  /**
   * Find all courses with optional filters
   */
  async findAll(filters?: {
    status?: string;
    category?: string;
    tutorId?: string;
    limit?: number;
    skip?: number;
  }) {
    const query: Record<string, unknown> = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.category) {
      query.category = filters.category;
    }
    if (filters?.tutorId) {
      query.tutorId = filters.tutorId;
    }

    const courses = await this.courseModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters?.limit || 100)
      .skip(filters?.skip || 0)
      .exec();

    return courses.map((c) => this.sanitizeCourse(c));
  }

  /**
   * Find a single course by ID
   */
  async findOne(id: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(id).exec();
    if (!course) {
      throw new NotFoundException(`Course ${id} not found`);
    }
    return course;
  }

  /**
   * Find courses by tutor ID with ownership check
   */
  async findByTutor(tutorId: string): Promise<Course[]> {
    const courses = await this.courseModel.find({ tutorId }).exec();
    return courses.map((c) => this.sanitizeCourse(c));
  }

  /**
   * Update a course (with ownership validation)
   */
  async update(
    id: string,
    dto: UpdateCourseDto,
    tutorId?: string,
    isAdmin: boolean = false,
  ): Promise<CourseDocument> {
    const course = await this.findOne(id);

    // Ownership check - only tutor or admin can update
    if (!isAdmin && course.tutorId !== tutorId) {
      throw new ForbiddenException('You can only update your own courses');
    }

    // If course is published, only allow certain fields to be updated
    if (course.status === 'published' && !isAdmin) {
      const allowedFields = [
        'description',
        'curriculum',
        'thumbnailUrl',
        'thumbnailImages',
      ];
      const updateKeys = Object.keys(dto);
      const hasDisallowedField = updateKeys.some(
        (key) => !allowedFields.includes(key),
      );

      if (hasDisallowedField) {
        throw new BadRequestException(
          'Published courses can only update description, curriculum, and images. Unpublish to make other changes.',
        );
      }

      // Mark for re-review if significant changes
      if (dto.curriculum) {
        course.status = 'pending';
      }
    }

    Object.assign(course, dto);
    await course.save();

    return course;
  }

  /**
   * Submit course for review
   */
  async submitForReview(id: string, tutorId: string): Promise<CourseDocument> {
    const course = await this.findOne(id);

    if (course.tutorId !== tutorId) {
      throw new ForbiddenException(
        'You can only submit your own courses for review',
      );
    }

    if (course.status !== 'draft' && course.status !== 'rejected') {
      throw new BadRequestException(
        'Only draft or rejected courses can be submitted for review',
      );
    }

    // Validate course has minimum required content
    if (!course.description || course.description.length < 50) {
      throw new BadRequestException(
        'Course description must be at least 50 characters',
      );
    }

    if (course.curriculum.length === 0) {
      throw new BadRequestException(
        'Course must have at least one curriculum item',
      );
    }

    course.status = 'pending';
    await course.save();

    this.eventEmitter.emit('course.submitted_for_review', {
      courseId: course.id,
      tutorId,
      tutorEmail: course.tutorEmail,
      title: course.title,
    });

    return course;
  }

  /**
   * Review a course (admin only)
   */
  async review(
    id: string,
    dto: ReviewCourseDto,
    adminId: string,
  ): Promise<{ message: string; course: CourseDocument }> {
    const course = await this.findOne(id);

    if (course.status !== 'pending') {
      throw new BadRequestException('Only pending courses can be reviewed');
    }

    course.status = dto.decision;

    if (dto.decision === 'approved') {
      course.approvedAt = new Date();
      course.rejectionReason = null;
      this.sendEmail(
        course.tutorEmail,
        'Course Approved',
        `Your course "${course.title}" has been approved and is ready to be published.`,
      );
    } else {
      course.rejectionReason =
        dto.reason || 'Course does not meet quality standards';
      this.sendEmail(
        course.tutorEmail,
        'Course Rejected',
        `Your course "${course.title}" has been rejected. Reason: ${course.rejectionReason}`,
      );
    }

    await course.save();

    this.eventEmitter.emit('course.reviewed', {
      courseId: course.id,
      tutorId: course.tutorId,
      tutorEmail: course.tutorEmail,
      decision: dto.decision,
    });

    return { message: `Course ${dto.decision}`, course };
  }

  /**
   * Publish a course
   */
  async publish(
    id: string,
    tutorId: string,
    isAdmin: boolean = false,
  ): Promise<{ message: string; course: CourseDocument }> {
    const course = await this.findOne(id);

    // Only tutor or admin can publish
    if (!isAdmin && course.tutorId !== tutorId) {
      throw new ForbiddenException('You can only publish your own courses');
    }

    if (course.status !== 'approved' && course.status !== 'unpublished') {
      throw new BadRequestException(
        'Only approved or unpublished courses can be published',
      );
    }

    course.status = 'published';
    course.publishedAt = new Date();
    await course.save();

    this.eventEmitter.emit('course.published', {
      courseId: course.id,
      tutorId: course.tutorId,
      tutorEmail: course.tutorEmail,
      title: course.title,
    });

    return { message: 'Course published', course };
  }

  /**
   * Unpublish a course
   */
  async unpublish(
    id: string,
    tutorId: string,
    isAdmin: boolean = false,
  ): Promise<{ message: string; course: CourseDocument }> {
    const course = await this.findOne(id);

    // Only tutor or admin can unpublish
    if (!isAdmin && course.tutorId !== tutorId) {
      throw new ForbiddenException('You can only unpublish your own courses');
    }

    if (course.status !== 'published') {
      throw new BadRequestException(
        'Only published courses can be unpublished',
      );
    }

    course.status = 'unpublished';
    await course.save();

    this.eventEmitter.emit('course.unpublished', {
      courseId: course.id,
      tutorId: course.tutorId,
      tutorEmail: course.tutorEmail,
      title: course.title,
    });

    return { message: 'Course unpublished', course };
  }

  /**
   * Delete a course (soft delete)
   */
  async delete(
    id: string,
    tutorId: string,
    isAdmin: boolean = false,
    reason?: string,
  ): Promise<{ message: string }> {
    const course = await this.findOne(id);

    // Only tutor or admin can delete
    if (!isAdmin && course.tutorId !== tutorId) {
      throw new ForbiddenException('You can only delete your own courses');
    }

    // Check if course has enrollments
    if (course.enrolledStudents.length > 0 && !isAdmin) {
      throw new BadRequestException(
        'Cannot delete course with enrolled students. Contact admin to delete.',
      );
    }

    course.deletedAt = new Date();
    course.deletedBy = isAdmin ? `admin:${adminId}` : `tutor:${tutorId}`;
    course.deletionReason = reason || 'User requested deletion';
    await course.save();

    // Update tutor stats
    await this.updateTutorStats(course.tutorId, -1);

    this.eventEmitter.emit('course.deleted', {
      courseId: course.id,
      tutorId: course.tutorId,
      reason: course.deletionReason,
    });

    return { message: 'Course deleted' };
  }

  /**
   * Get course enrollments
   */
  async getEnrollments(id: string) {
    const course = await this.findOne(id);
    return {
      courseId: id,
      courseTitle: course.title,
      enrolledStudents: course.enrolledStudents,
      totalEnrolled: course.enrolledStudents.length,
    };
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.courseModel
      .findByIdAndUpdate(id, {
        $inc: { viewCount: 1 },
      })
      .exec();
  }

  /**
   * Add student to enrolled list
   */
  async enrollStudent(courseId: string, studentId: string): Promise<void> {
    const course = await this.findOne(courseId);

    if (course.enrolledStudents.includes(studentId)) {
      throw new ConflictException('Student already enrolled');
    }

    course.enrolledStudents.push(studentId);
    course.totalEnrollments += 1;
    await course.save();

    // Update tutor stats
    await this.updateTutorStats(course.tutorId, 0, 1);

    this.eventEmitter.emit('student.enrolled', {
      courseId,
      studentId,
      tutorId: course.tutorId,
    });
  }

  /**
   * Update course statistics
   */
  async updateCourseStats(
    courseId: string,
    updates: {
      averageRating?: number;
      totalReviews?: number;
      totalWishlists?: number;
      totalCarts?: number;
    },
  ): Promise<void> {
    await this.courseModel.findByIdAndUpdate(courseId, updates).exec();
  }

  /**
   * Update tutor statistics
   */
  private async updateTutorStats(
    tutorId: string,
    courseDelta: number = 0,
    studentDelta: number = 0,
  ): Promise<void> {
    const update: Record<string, number> = {};
    if (courseDelta !== 0) {
      update.totalCourses = courseDelta;
    }
    if (studentDelta !== 0) {
      update.totalStudents = studentDelta;
    }

    if (Object.keys(update).length > 0) {
      await this.courseModel.db
        .collection('tutors')
        .updateOne({ _id: tutorId }, { $inc: update });
    }
  }

  private sanitizeCourse(course: CourseDocument) {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      tags: course.tags,
      price: course.price,
      thumbnailUrl: course.thumbnailUrl,
      thumbnailImages: course.thumbnailImages,
      tutorId: course.tutorId,
      tutorEmail: course.tutorEmail,
      tutorName: course.tutorName,
      level: course.level,
      duration: course.duration,
      durationHours: course.durationHours,
      language: course.language,
      hasCertificate: course.hasCertificate,
      status: course.status,
      curriculum: course.curriculum,
      enrolledStudents: course.enrolledStudents,
      totalEnrollments: course.totalEnrollments,
      totalReviews: course.totalReviews,
      averageRating: course.averageRating,
      totalWishlists: course.totalWishlists,
      totalCarts: course.totalCarts,
      viewCount: course.viewCount,
      publishedAt: course.publishedAt,
      approvedAt: course.approvedAt,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }

  private sendEmail(to: string, subject: string, body: string) {
    console.log(`[Email] To: ${to} | Subject: ${subject} | Body: ${body}`);
  }
}
