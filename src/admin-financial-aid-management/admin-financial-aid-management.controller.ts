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
import { AdminFinancialAidManagementService } from './admin-financial-aid-management.service';
import { CreateAdminFinancialAidManagementDto } from './dto/create-admin-financial-aid-management.dto';
import { UpdateAdminFinancialAidManagementDto } from './dto/update-admin-financial-aid-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditActor } from '../common/audit/audit-context';
import type { AuditContext } from '../common/audit/audit-context';

@ApiTags('Admin Financial Aid Management')
@ApiBearerAuth('access-token')
@Controller('admin/financial-aid')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminFinancialAidManagementController {
  constructor(private readonly service: AdminFinancialAidManagementService) {}

  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Retrieve all financial aid management records' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific financial aid management record' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new financial aid management record' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(
    @Body() payload: CreateAdminFinancialAidManagementDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.create(payload, audit);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing financial aid management record' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateAdminFinancialAidManagementDto,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.update(id, payload, audit);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a financial aid management record' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @AuditActor() audit: AuditContext,
  ) {
    return this.service.remove(id, audit);
  }
}
