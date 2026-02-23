import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminCertificateNameChangeReviewService } from './admin-certificate-name-change-review.service';
import { CreateAdminCertificateNameChangeReviewDto } from './dto/create-admin-certificate-name-change-review.dto';
import { UpdateAdminCertificateNameChangeReviewDto } from './dto/update-admin-certificate-name-change-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/certificates/name-change-review')
export class AdminCertificateNameChangeReviewController {
  constructor(private readonly service: AdminCertificateNameChangeReviewService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateAdminCertificateNameChangeReviewDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(@Param('id') id: string, @Body() payload: UpdateAdminCertificateNameChangeReviewDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
