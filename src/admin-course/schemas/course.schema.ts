import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { applySoftDeleteSchema } from '../../common/soft-delete/soft-delete.schema';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, maxlength: 5000 })
  description: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: null })
  thumbnailUrl: string | null;

  @Prop({ type: [String], default: [] })
  thumbnailImages: string[];

  // Tutor/Owner reference
  @Prop({ required: true })
  tutorId: string;

  @Prop({ required: true })
  tutorEmail: string;

  @Prop({ required: true })
  tutorName: string;

  // Course metadata
  @Prop({ default: 'beginner' })
  level: 'beginner' | 'intermediate' | 'advanced' | 'all-levels';

  @Prop({ default: null })
  duration: string | null; // e.g., "10 hours", "6 weeks"

  @Prop({ default: 0 })
  durationHours: number; // Numeric duration in hours for filtering

  @Prop({ default: null })
  language: string | null; // e.g., "English"

  @Prop({ default: false })
  hasCertificate: boolean;

  @Prop({ default: 'draft' })
  status:
    | 'draft'
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'published'
    | 'unpublished';

  // Curriculum
  @Prop({
    type: [
      {
        title: String,
        description: String,
        duration: String,
        order: Number,
        resources: [
          {
            title: String,
            type: String,
            url: String,
          },
        ],
      },
    ],
    default: [],
  })
  curriculum: Array<{
    title: string;
    description?: string;
    duration?: string;
    order: number;
    resources?: Array<{
      title: string;
      type: string;
      url: string;
    }>;
  }>;

  // Enrollment tracking
  @Prop({ type: [String], default: [] })
  enrolledStudents: string[];

  @Prop({ default: 0 })
  totalEnrollments: number;

  // Statistics (denormalized for performance)
  @Prop({ default: 0 })
  totalReviews: number;

  @Prop({ default: 0 })
  averageRating: number;

  @Prop({ default: 0 })
  totalWishlists: number;

  @Prop({ default: 0 })
  totalCarts: number;

  @Prop({ default: 0 })
  viewCount: number;

  // Status tracking
  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  @Prop({ type: Date, default: null })
  approvedAt: Date | null;

  @Prop({ type: String, default: null })
  rejectionReason: string | null;

  // Soft delete fields
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: String, default: null })
  deletedBy?: string | null;

  @Prop({ type: String, default: null })
  deletionReason?: string | null;

  @Prop({ type: Date, default: null })
  restoreBy?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

// Indexes for efficient queries
CourseSchema.index({ tutorId: 1 });
CourseSchema.index({ tutorEmail: 1 });
CourseSchema.index({ status: 1 });
CourseSchema.index({ category: 1 });
CourseSchema.index({ level: 1 });
CourseSchema.index({ price: 1 });
CourseSchema.index({ averageRating: 1 });
CourseSchema.index({ totalEnrollments: 1 });
CourseSchema.index({ tags: 1 });
CourseSchema.index({ title: 'text', description: 'text' });

applySoftDeleteSchema(CourseSchema);
