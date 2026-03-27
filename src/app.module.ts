import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { AppService } from './app.service';
import { WorkerModule } from './worker/worker.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';

// Course modules
import { AdminCourseModule } from './admin-course/admin-course.module';
import { TutorModule } from './tutor/tutor.module';
import { TutorCourseModule } from './tutor-course/tutor-course.module';
import { CourseDiscoveryModule } from './course-discovery/course-discovery.module';
import { CourseRatingsFeedbackModule } from './course-ratings-feedback/course-ratings-feedback.module';
import { StudentSavedCoursesModule } from './student-saved-courses/student-saved-courses.module';
import { StudentCartModule } from './student-cart/student-cart.module';
import { StudentEnrollmentModule } from './student-enrollment/student-enrollment.module';
import { CourseAnalyticsModule } from './course-analytics/course-analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 10,
      },
    ]),
    // MongoDB connection
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chainverse',
      }),
    }),
    WorkerModule,
    MetricsModule,
    TracingModule,
    // Tutor modules
    TutorModule,
    // Course modules
    AdminCourseModule,
    TutorCourseModule,
    CourseDiscoveryModule,
    CourseRatingsFeedbackModule,
    // Student modules
    StudentSavedCoursesModule,
    StudentCartModule,
    StudentEnrollmentModule,
    // Analytics
    CourseAnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply the throttler guard to every route in the application
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
