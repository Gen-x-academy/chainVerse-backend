import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from '../admin-course/schemas/course.schema';
import { SearchCoursesDto } from './dto/search-courses.dto';
import { PaginationService } from '../common/pagination/pagination.service';

@Injectable()
export class CourseDiscoveryService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  /**
   * Search and filter courses
   */
  async search(dto: SearchCoursesDto) {
    const query: Record<string, unknown> = {
      status: 'published',
      deletedAt: null,
    };

    // Text search
    if (dto.query) {
      query.$text = { $search: dto.query };
    }

    // Category filter
    if (dto.category) {
      query.category = dto.category;
    }

    // Level filter
    if (dto.level) {
      query.level = dto.level;
    }

    // Tags filter
    if (dto.tags && dto.tags.length > 0) {
      query.tags = { $in: dto.tags };
    }

    // Price range filter
    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      query.price = {};
      if (dto.minPrice !== undefined) {
        (query.price as Record<string, number>).$gte = dto.minPrice;
      }
      if (dto.maxPrice !== undefined) {
        (query.price as Record<string, number>).$lte = dto.maxPrice;
      }
    }

    // Rating filter
    if (dto.minRating !== undefined) {
      query.averageRating = { $gte: dto.minRating };
    }

    return this.paginationService.paginate(
      this.courseModel,
      dto,
      query,
      this.sanitizeCourse,
    );
  }

  /**
   * Get featured courses (high rating, popular)
   */
  async getFeatured(limit: number = 10) {
    const courses = await this.courseModel
      .find({
        status: 'published',
        deletedAt: null,
      })
      .sort({ averageRating: -1, totalEnrollments: -1 })
      .limit(limit)
      .exec();

    return courses.map((c) => this.sanitizeCourse(c));
  }

  /**
   * Get courses by category
   */
  async getByCategory(category: string, limit: number = 20) {
    const courses = await this.courseModel
      .find({
        category,
        status: 'published',
        deletedAt: null,
      })
      .sort({ totalEnrollments: -1 })
      .limit(limit)
      .exec();

    return courses.map((c) => this.sanitizeCourse(c));
  }

  /**
   * Get all categories with course counts
   */
  async getCategories() {
    interface CategoryAggResult {
      _id: string;
      count: number;
      avgPrice: number;
    }

    const categories = await this.courseModel.aggregate<CategoryAggResult>([
      {
        $match: {
          status: 'published',
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    return categories.map((c) => ({
      name: c._id,
      count: c.count,
      avgPrice: Math.round(c.avgPrice * 100) / 100,
    }));
  }

  /**
   * Get a single course by ID (public view)
   */
  async findOne(id: string) {
    const course = await this.courseModel.findById(id).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Increment view count
    await this.courseModel
      .findByIdAndUpdate(id, {
        $inc: { viewCount: 1 },
      })
      .exec();

    return this.sanitizeCourse(course);
  }

  /**
   * Get courses by tutor ID (public view)
   */
  async findByTutorPublic(tutorId: string) {
    const courses = await this.courseModel
      .find({
        tutorId,
        status: 'published',
        deletedAt: null,
      })
      .exec();

    return courses.map((c) => this.sanitizeCourse(c));
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
      tutorName: course.tutorName,
      level: course.level,
      duration: course.duration,
      durationHours: course.durationHours,
      language: course.language,
      hasCertificate: course.hasCertificate,
      status: course.status,
      totalEnrollments: course.totalEnrollments,
      totalReviews: course.totalReviews,
      averageRating: course.averageRating,
      viewCount: course.viewCount,
      publishedAt: course.publishedAt,
      curriculum: course.curriculum.map((section) => ({
        title: section.title,
        description: section.description,
        duration: section.duration,
        order: section.order,
        resourceCount: section.resources?.length || 0,
      })),
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }
}