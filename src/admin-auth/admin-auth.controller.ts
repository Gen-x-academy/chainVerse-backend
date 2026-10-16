import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { LoginAdminDto } from './dto/login-admin.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin login' })
  @ApiResponse({ status: 200, description: 'Login successful with access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account locked' })
  login(@Body() payload: LoginAdminDto) {
    return this.service.login(payload);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refreshToken(@Body() payload: RefreshTokenDto) {
    return this.service.refreshToken(payload);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  logout(@Body() payload: RefreshTokenDto) {
    return this.service.logout(payload);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  getProfile(@CurrentUser() user: any) {
    return this.service.getProfile(user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Get all admins (admin only)' })
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get admin by ID (admin only)' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @Post()
  @ApiOperation({ summary: 'Create new admin account' })
  create(
    @Body() payload: CreateAdminDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.create(payload, audit);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Update admin account' })
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateAdminDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.update(id, payload, audit);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete admin account (admin only)' })
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.remove(id, audit);
  }
}