import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { TermsConditionsManagementService } from './terms-conditions-management.service';
import { CreateTermsConditionsManagementDto } from './dto/create-terms-conditions-management.dto';
import { UpdateTermsConditionsManagementDto } from './dto/update-terms-conditions-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Terms & Conditions')
@ApiBearerAuth('access-token')
@Controller('terms-conditions')
export class TermsConditionsManagementController {
  constructor(private readonly service: TermsConditionsManagementService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all terms and conditions documents' })
  @ApiResponse({
    status: 200,
    description: 'Terms and conditions documents returned',
  })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a terms and conditions document by id' })
  @ApiResponse({
    status: 200,
    description: 'Terms and conditions document returned',
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a terms and conditions document' })
  @ApiResponse({
    status: 201,
    description: 'Terms and conditions document created',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateTermsConditionsManagementDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a terms and conditions document' })
  @ApiResponse({
    status: 200,
    description: 'Terms and conditions document updated',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateTermsConditionsManagementDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a terms and conditions document' })
  @ApiResponse({
    status: 200,
    description: 'Terms and conditions document deleted',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
