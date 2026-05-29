import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { AppService } from './app.service';
import { WorkerModule } from './worker/worker.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { EmailModule } from './email/email.module';
import { StellarModule } from './stellar/stellar.module';

// Course modules
import { AdminCourseModule } from './admin-course/admin-course.module';
import { BadgeModule } from './badge/badge.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { TutorModule } from './tutor/tutor.module';
import { TutorCourseModule } from './tutor-course/tutor-course.module';
import { CourseDiscoveryModule } from './course-discovery/course-discovery.module';
import { CourseRatingsFeedbackModule } from './course-ratings-feedback/course-ratings-feedback.module';
import { StudentSavedCoursesModule } from './student-saved-courses/student-saved-courses.module';
import { StudentCartModule } from './student-cart/student-cart.module';
import { StudentEnrollmentModule } from './student-enrollment/student-enrollment.module';
import { CourseAnalyticsModule } from './course-analytics/course-analytics.module';
import { GamificationPointsModule } from './gamification-points/gamification-points.module';
import { FaqManagementModule } from './faq-management/faq-management.module';
import { GoogleAuthModule } from './google-auth/google-auth.module';
import { PointsModule } from './points/points.module';
import { HealthModule } from './health/health.module';
import { SubscriptionPlanModule } from './subscription-plan/subscription-plan.module';
import { OrganizationModule } from './organization/organization.module';
import { OrganizationMemberModule } from './organization-member/organization-member.module';
import { NotificationModule } from './notification/notification.module';
import { FinancialAidModule } from './financial-aid/financial-aid.module';
import { StudentAuthModule } from './student-auth/student-auth.module';
import { ContactMessageModule } from './contact-message/contact-message.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('redis.url');
        return {
          throttlers: [{ ttl: 60, limit: 10 }],
          ...(redisUrl && {
            storage: new ThrottlerStorageRedisService(redisUrl),
          }),
        };
      },
      inject: [ConfigService],
    }),
    // Global JWT module — makes JwtService available to all guards/services
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: { algorithm: 'HS256' },
      }),
      inject: [ConfigService],
    }),
    // MongoDB connection — reads mongoUri from app.config.ts which maps MONGO_URI
    MongooseModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongoUri'),
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      }),
      inject: [ConfigService],
    }),
    WorkerModule,
    MetricsModule,
    TracingModule,
    EmailModule,
    // Tutor modules
    TutorModule,
    // Course modules
    AdminAuthModule,
    AdminCourseModule,
    TutorCourseModule,
    CourseDiscoveryModule,
    CourseRatingsFeedbackModule,
    BadgeModule,
    // Student modules
    StudentAuthModule,
    StudentSavedCoursesModule,
    StudentCartModule,
    StudentEnrollmentModule,
    // Analytics
    CourseAnalyticsModule,
    // Gamification
    GamificationPointsModule,
    // FAQ
    FaqManagementModule,
    // Google Auth
    GoogleAuthModule,
    // Points
    PointsModule,
    // Health
    HealthModule,
    // Subscription Plan
    SubscriptionPlanModule,
    // Organization
    OrganizationModule,
    OrganizationMemberModule,
    // Notification
    NotificationModule,
    // Financial Aid
    FinancialAidModule,
    // Contact
    ContactMessageModule,
    // Reporting
    ReportsModule,
    // Stellar
    StellarModule,
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
