import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppLoggerModule } from './logger/logger.module';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './common/config/env.validation';
import { AppService } from './app.service';
import { WorkerModule } from './worker/worker.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { EmailModule } from './email/email.module';
import { StellarModule } from './stellar/stellar.module';
import { AppCacheModule } from './cache/app-cache.module';
import { SessionModule } from './session/session.module';

// Auth modules
import { StudentAuthModule } from './student-auth/student-auth.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { GoogleAuthModule } from './google-auth/google-auth.module';
import { TutorJwtAuthModule } from './tutor-jwt-auth/tutor-jwt-auth.module';

// Tutor modules
import { TutorModule } from './tutor/tutor.module';
import { TutorCourseModule } from './tutor-course/tutor-course.module';
import { TutorAccountSettingsModule } from './tutor-account-settings/tutor-account-settings.module';
import { TutorReportsAnalyticsModule } from './tutor-reports-analytics/tutor-reports-analytics.module';

// Course modules
import { AdminCourseModule } from './admin-course/admin-course.module';
import { CourseDiscoveryModule } from './course-discovery/course-discovery.module';
import { CourseRatingsFeedbackModule } from './course-ratings-feedback/course-ratings-feedback.module';
import { CourseCategorizationFilteringModule } from './course-categorization-filtering/course-categorization-filtering.module';
import { CourseCertificationNftAchievementsModule } from './course-certification-nft-achievements/course-certification-nft-achievements.module';
import { CoursePerformanceLeaderboardModule } from './course-performance-leaderboard/course-performance-leaderboard.module';
import { CourseReportsAnalyticsModule } from './course-reports-analytics/course-reports-analytics.module';
import { CourseAnalyticsModule } from './course-analytics/course-analytics.module';

// Student modules
import { StudentSavedCoursesModule } from './student-saved-courses/student-saved-courses.module';
import { StudentCartModule } from './student-cart/student-cart.module';
import { StudentEnrollmentModule } from './student-enrollment/student-enrollment.module';
import { StudentAccountSettingsModule } from './student-account-settings/student-account-settings.module';
import { StudentCertificateNameChangeRequestModule } from './student-certificate-name-change-request/student-certificate-name-change-request.module';
import { StudentReportsAnalyticsModule } from './student-reports-analytics/student-reports-analytics.module';

// Admin modules
import { AdminFinancialAidManagementModule } from './admin-financial-aid-management/admin-financial-aid-management.module';
import { AdminModeratorAccountSettingsModule } from './admin-moderator-account-settings/admin-moderator-account-settings.module';

// Platform feature modules
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notification/notification.module';
import { FinancialAidModule } from './financial-aid/financial-aid.module';
import { OrganizationModule } from './organization/organization.module';
import { OrganizationMemberModule } from './organization-member/organization-member.module';
import { SubscriptionPlanModule } from './subscription-plan/subscription-plan.module';
import { BadgeModule } from './badge/badge.module';
import { PointsModule } from './points/points.module';
import { GamificationPointsModule } from './gamification-points/gamification-points.module';
import { CertificateSocialSharingModule } from './certificate-social-sharing/certificate-social-sharing.module';
import { CertificationModule } from './certification/certification.module';
import { ContactMessageModule } from './contact-message/contact-message.module';
import { FaqManagementModule } from './faq-management/faq-management.module';
import { TermsConditionsManagementModule } from './terms-conditions-management/terms-conditions-management.module';
import { AboutManagementModule } from './about-management/about-management.module';
import { PrivateTutoringBookingsModule } from './private-tutoring-bookings/private-tutoring-bookings.module';
import { RemovalRequestModule } from './removal-request/removal-request.module';
import { ReportAbuseModule } from './report-abuse/report-abuse.module';
import { ReportsModule } from './reports/reports.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { PrivacyPolicyManagementModule } from './privacy-policy-management/privacy-policy-management.module';
import { VerificationModule } from './verification/verification.module';

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
          throttlers: [{ ttl: 60_000, limit: 10 }],
          ...(redisUrl && {
            storage: new ThrottlerStorageRedisService(redisUrl),
          }),
        };
      },
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: { algorithm: 'HS256' },
      }),
      inject: [ConfigService],
    }),
    AppCacheModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongoUri'),
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      }),
      inject: [ConfigService],
    }),
    AppLoggerModule,
    WorkerModule,
    MetricsModule,
    TracingModule,
    EmailModule,
    StellarModule,
    SessionModule,
    // Auth
    StudentAuthModule,
    AdminAuthModule,
    GoogleAuthModule,
    TutorJwtAuthModule,
    // Tutor
    TutorModule,
    TutorCourseModule,
    TutorAccountSettingsModule,
    TutorReportsAnalyticsModule,
    EmailModule,
    SessionModule,
    // Course
    AdminCourseModule,
    CourseDiscoveryModule,
    CourseRatingsFeedbackModule,
    CourseCategorizationFilteringModule,
    CourseCertificationNftAchievementsModule,
    CoursePerformanceLeaderboardModule,
    CourseReportsAnalyticsModule,
    CourseAnalyticsModule,
    // Student
    StudentSavedCoursesModule,
    StudentCartModule,
    StudentEnrollmentModule,
    StudentAccountSettingsModule,
    StudentCertificateNameChangeRequestModule,
    StudentReportsAnalyticsModule,
    // Admin
    AdminFinancialAidManagementModule,
    AdminModeratorAccountSettingsModule,
    // Platform features
    HealthModule,
    NotificationModule,
    FinancialAidModule,
    OrganizationModule,
    OrganizationMemberModule,
    SubscriptionPlanModule,
    BadgeModule,
    PointsModule,
    GamificationPointsModule,
    CertificateSocialSharingModule,
    CertificationModule,
    ContactMessageModule,
    FaqManagementModule,
    PrivacyPolicyManagementModule,
    TermsConditionsManagementModule,
    AboutManagementModule,
    PrivateTutoringBookingsModule,
    RemovalRequestModule,
    ReportAbuseModule,
    ReportsModule,
    StellarModule,
    IdempotencyModule,
    VerificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
