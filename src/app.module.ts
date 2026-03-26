import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import appConfig from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { AppService } from './app.service';
import { AppLoggerModule } from './logger/logger.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { FinancialAidModule } from './financial-aid/financial-aid.module';
import { BadgeModule } from './badge/badge.module';
import { NotificationModule } from './notification/notification.module';
import { OrganizationModule } from './organization/organization.module';
import { OrganizationMemberModule } from './organization-member/organization-member.module';
import { PointsModule } from './points/points.module';
import { RemovalRequestModule } from './removal-request/removal-request.module';
import { ReportAbuseModule } from './report-abuse/report-abuse.module';
import { SessionModule } from './session/session.module';
import { SubscriptionPlanModule } from './subscription-plan/subscription-plan.module';
import { CourseRatingsFeedbackModule } from './course-ratings-feedback/course-ratings-feedback.module';
import { StudentSavedCoursesModule } from './student-saved-courses/student-saved-courses.module';
import { GoogleAuthModule } from './google-auth/google-auth.module';
import { StudentCartModule } from './student-cart/student-cart.module';
import { StudentAuthModule } from './student-auth/student-auth.module';
import { AdminCourseModule } from './admin-course/admin-course.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    AppLoggerModule,
    EventEmitterModule.forRoot(),
    EventsModule,
    HealthModule,
    DatabaseModule,
    FinancialAidModule,
    BadgeModule,
    NotificationModule,
    OrganizationModule,
    OrganizationMemberModule,
    PointsModule,
    RemovalRequestModule,
    ReportAbuseModule,
    SessionModule,
    SubscriptionPlanModule,
    CourseRatingsFeedbackModule,
    StudentSavedCoursesModule,
    GoogleAuthModule,
    StudentCartModule,
    StudentAuthModule,
    AdminCourseModule,
    AdminAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
