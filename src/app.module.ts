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

@Module({
  imports: [
    FinancialAidModule,
    BadgeModule,
    NotificationModule,
    OrganizationModule,
    OrganizationMemberModule,
    PointsModule,
    RemovalRequestModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
