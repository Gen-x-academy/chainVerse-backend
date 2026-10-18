import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppLoggerModule } from './logger/logger.module';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './common/config/env.validation';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuditModule } from './common/audit/audit.module';
import { WorkerModule } from './worker/worker.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { TracingModule } from './tracing/tracing.module';
import { EmailModule } from './email/email.module';
import { StellarModule } from './stellar/stellar.module';
import { MentorshipConfigModule } from './mentorship-config/mentorship-config.module';
import { AppCacheModule } from './cache/app-cache.module';
import { SessionModule } from './session/session.module';
import { SessionService } from './session/session.service';
import { StreakModule } from './session/streak.module';

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
import { CurriculumModule } from './curriculum/curriculum.module';
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
import { CourseAnalyticsModule } from './course-analytics/course-analytics.module';
// Mentorship modules
import { MentorshipApplicationsModule } from './mentorship-applications/mentorship-applications.module';
// Scholarship finance
import { ScholarshipFinanceModule } from './scholarship-finance/scholarship-finance.module';
// Platform extras imported by student flows
import { EventsModule } from './events/events.module';
import { ScholarshipOutboxModule } from './scholarship-outbox/scholarship-outbox.module';
import { LibraryCirculationModule } from './library-circulation/library-circulation.module';
import { StudentAccountSettingsModule } from './student-account-settings/student-account-settings.module';
import { StudentCertificateNameChangeRequestModule } from './student-certificate-name-change-request/student-certificate-name-change-request.module';
import { StudentReportsAnalyticsModule } from './student-reports-analytics/student-reports-analytics.module';

// Admin modules
import { AdminFinancialAidManagementModule } from './admin-financial-aid-management/admin-financial-aid-management.module';
import { AdminModeratorAccountSettingsModule } from './admin-moderator-account-settings/admin-moderator-account-settings.module';

// Platform / feature modules
import { HealthModule } from './health/health.module';
import { NotificationModule } from './notification/notification.module';
import { FinancialAidModule } from './financial-aid/financial-aid.module';
import { OrganizationModule } from './organization/organization.module';
import { OrganizationMemberModule } from './organization-member/organization-member.module';
import { OrganizationUserModule } from './organization-user/organization-user.module';
import { SubscriptionPlanModule } from './subscription-plan/subscription-plan.module';
import { BadgeModule } from './badge/badge.module';
import { PointsModule } from './points/points.module';
import { GamificationPointsModule } from './gamification-points/gamification-points.module';
import { CertificateSocialSharingModule } from './certificate-social-sharing/certificate-social-sharing.module';
import { CertificationModule } from './certification/certification.module';
import { ContactMessageModule } from './contact-message/contact-message.module';
import { FaqManagementModule } from './faq-management/faq-management.module';
import { PrivacyPolicyManagementModule } from './privacy-policy-management/privacy-policy-management.module';
import { TermsConditionsManagementModule } from './terms-conditions-management/terms-conditions-management.module';
import { AboutManagementModule } from './about-management/about-management.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { PrivateTutoringBookingsModule } from './private-tutoring-bookings/private-tutoring-bookings.module';
import { RemovalRequestModule } from './removal-request/removal-request.module';
import { ReportAbuseModule } from './report-abuse/report-abuse.module';
import { ReportsModule } from './reports/reports.module';
import { MentorshipLifecycleModule } from './mentorship/lifecycle/mentorship-lifecycle.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { PrivacyPolicyManagementModule } from './privacy-policy-management/privacy-policy-management.module';
import { VerificationModule } from './verification/verification.module';
import { WebhookSecurityModule } from './webhook-security/webhook-security.module';
import { ScholarshipsModule } from './scholarships/scholarships.module';
import { ScholarshipModule } from './scholarship/scholarship.module';
import { ScholarshipDisbursementModule } from './scholarship-disbursement/scholarship-disbursement.module';
import { ScholarshipStudentDashboardModule } from './scholarship-student-dashboard/scholarship-student-dashboard.module';
import { ScholarshipSponsorDashboardModule } from './scholarship-sponsor-dashboard/scholarship-sponsor-dashboard.module';
import { ScholarshipReviewerDashboardModule } from './scholarship-reviewer-dashboard/scholarship-reviewer-dashboard.module';
import { ScholarshipFinanceStatementModule } from './scholarship-finance-statement/scholarship-finance-statement.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { EventsModule } from './events/events.module';
import { LibraryCirculationModule } from './library-circulation/library-circulation.module';
import { ELibraryModule } from './e-library/e-library.module';
import { ScholarshipsModule } from './scholarships/scholarships.module';
import { DigitalRenditionsModule } from './digital-renditions/digital-renditions.module';

// Mentorship
import { MentorshipModule } from './mentorship/mentorship.module';
// Mentorship deliverables (MENTOR-073/074) and progress timeline (MENTOR-075)
import { MentorshipDeliverablesModule } from './mentorship-deliverables/mentorship-deliverables.module';
import { MentorshipTimelineModule } from './mentorship-timeline/mentorship-timeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
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
    // Global: exports AuditService to every feature module.
    AuditModule,
    WorkerModule,
    MetricsModule,
    TracingModule,
    EmailModule,
    StellarModule,
    MentorshipConfigModule,
    SessionModule,
    StreakModule,
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
    // Course
    AdminCourseModule,
    CurriculumModule,
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
    // Analytics
    CourseAnalyticsModule,
    // Mentorship (MENTOR-032/033/034)
    MentorshipModule,
    // Mentorship
    MentorshipApplicationsModule,
    EventsModule,
    LibraryCirculationModule,
    // Scholarship finance
    ScholarshipFinanceModule,
    // E-Library + student reporting
    ELibraryModule,
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
    OrganizationUserModule,
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
    MentorshipModule,
    PrivateTutoringBookingsModule,
    MentorshipModule,
    RemovalRequestModule,
    ReportAbuseModule,
    ReportsModule,
    MentorshipLifecycleModule,
    MentorshipDeliverablesModule,
    MentorshipTimelineModule,
    WebhookSecurityModule,
    IdempotencyModule,
    VerificationModule,
    MentorshipModule,
    EventsModule,
    LibraryCirculationModule,
    ELibraryModule,
    // Scholarship domain
    ScholarshipsModule,
    DigitalRenditionsModule,
    ScholarshipModule,
    ScholarshipDisbursementModule,
    ScholarshipOutboxModule,
    // Scholarship dashboards
    ScholarshipStudentDashboardModule,
    ScholarshipSponsorDashboardModule,
    ScholarshipReviewerDashboardModule,
    ScholarshipFinanceStatementModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SessionService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
