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
import { AppCacheModule } from './cache/app-cache.module';
import { SessionModule } from './session/session.module';

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
import { CoursePerformanceLeaderboardModule } from './course-performance-leaderboard/course-performance-leaderboard.module';
import { FinancialAidModule } from './financial-aid/financial-aid.module';
import { StudentAuthModule } from './student-auth/student-auth.module';
import { ContactMessageModule } from './contact-message/contact-message.module';
import { ReportsModule } from './reports/reports.module';
import { AboutManagementModule } from './about-management/about-management.module';
import { AdminFinancialAidManagementModule } from './admin-financial-aid-management/admin-financial-aid-management.module';
import { AdminModeratorAccountSettingsModule } from './admin-moderator-account-settings/admin-moderator-account-settings.module';
import { CertificateSocialSharingModule } from './certificate-social-sharing/certificate-social-sharing.module';
import { CourseCertificationNftAchievementsModule } from './course-certification-nft-achievements/course-certification-nft-achievements.module';
import { CourseCategorizationFilteringModule } from './course-categorization-filtering/course-categorization-filtering.module';
import { CourseReportsAnalyticsModule } from './course-reports-analytics/course-reports-analytics.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { PrivacyPolicyManagementModule } from './privacy-policy-management/privacy-policy-management.module';
import { PrivateTutoringBookingsModule } from './private-tutoring-bookings/private-tutoring-bookings.module';
import { RemovalRequestModule } from './removal-request/removal-request.module';
import { ReportAbuseModule } from './report-abuse/report-abuse.module';
import { StudentAccountSettingsModule } from './student-account-settings/student-account-settings.module';
import { StudentCertificateNameChangeRequestModule } from './student-certificate-name-change-request/student-certificate-name-change-request.module';
import { StudentReportsAnalyticsModule } from './student-reports-analytics/student-reports-analytics.module';
import { TermsConditionsManagementModule } from './terms-conditions-management/terms-conditions-management.module';
import { TutorAccountSettingsModule } from './tutor-account-settings/tutor-account-settings.module';
import { TutorJwtAuthModule } from './tutor-jwt-auth/tutor-jwt-auth.module';
import { TutorReportsAnalyticsModule } from './tutor-reports-analytics/tutor-reports-analytics.module';

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
    AppCacheModule,
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
    SessionModule,
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
    CoursePerformanceLeaderboardModule,
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
    // About
    AboutManagementModule,
    // Admin management
    AdminFinancialAidManagementModule,
    AdminModeratorAccountSettingsModule,
    // Certificate
    CertificateSocialSharingModule,
    CourseCertificationNftAchievementsModule,
    // Contact
    ContactMessageModule,
    // Course features
    CourseCategorizationFilteringModule,
    CoursePerformanceLeaderboardModule,
    CourseReportsAnalyticsModule,
    // Idempotency
    IdempotencyModule,
    // Policy & legal
    PrivacyPolicyManagementModule,
    TermsConditionsManagementModule,
    // Tutoring & sessions
    PrivateTutoringBookingsModule,
    SessionModule,
    // Moderation
    RemovalRequestModule,
    ReportAbuseModule,
    // Student features
    StudentAccountSettingsModule,
    StudentCertificateNameChangeRequestModule,
    StudentReportsAnalyticsModule,
    // Tutor features
    TutorAccountSettingsModule,
    TutorJwtAuthModule,
    TutorReportsAnalyticsModule,
    // Cache
    AppCacheModule,
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
