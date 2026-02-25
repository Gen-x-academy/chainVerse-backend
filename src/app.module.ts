import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
