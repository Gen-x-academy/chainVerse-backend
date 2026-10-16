import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { Admin, AdminSchema } from './schemas/admin.schema';
import {
  AdminRefreshToken,
  AdminRefreshTokenSchema,
} from './schemas/admin-refresh-token.schema';
import { AuditModule } from '../common/audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admin.name, schema: AdminSchema },
      { name: AdminRefreshToken.name, schema: AdminRefreshTokenSchema },
    ]),
    JwtModule.register({}),
    AuditModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}