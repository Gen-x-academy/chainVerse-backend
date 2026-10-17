import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
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
import { AdminCertificateNameChangeReviewService } from './admin-certificate-name-change-review.service';
import { CreateAdminCertificateNameChangeReviewDto } from './dto/create-admin-certificate-name-change-review.dto';
import { UpdateAdminCertificateNameChangeReviewDto } from './dto/update-admin-certificate-name-change-review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/enums/role.enum';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Certificate Name Change Review')
@ApiBearerAuth('access-token')
@Controller('admin/certificates/name-change-review')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminCertificateNameChangeReviewController {
  constructor(
    private readonly service: AdminCertificateNameChangeReviewService,
  ) {}

  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get()
  @ApiOperation({ summary: 'List certificate name change requests' })
  @ApiResponse({ status: 200, description: 'Requests returned' })
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get(':id')
  @ApiOperation({ summary: 'Get a certificate name change request by id' })
  @ApiResponse({ status: 200, description: 'Request returned' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a certificate name change request' })
  @ApiResponse({ status: 201, description: 'Request created' })
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateAdminCertificateNameChangeReviewDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Review a certificate name change request' })
  @ApiResponse({ status: 200, description: 'Request updated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateAdminCertificateNameChangeReviewDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a certificate name change request' })
  @ApiResponse({ status: 200, description: 'Request deleted' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
