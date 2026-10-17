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
import { TutorJwtAuthService } from './tutor-jwt-auth.service';
import { CreateTutorJwtAuthDto } from './dto/create-tutor-jwt-auth.dto';
import { UpdateTutorJwtAuthDto } from './dto/update-tutor-jwt-auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Tutor JWT Auth')
@ApiBearerAuth('access-token')
@Controller('tutor/jwt-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TutorJwtAuthController {
  constructor(private readonly service: TutorJwtAuthService) {}

  @Roles(Role.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Retrieve all tutor JWT auth records' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific tutor JWT auth record by id' })
  @ApiResponse({ status: 200, description: 'Record found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new tutor JWT auth record' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  async create(@Body() payload: CreateTutorJwtAuthDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing tutor JWT auth record' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  async update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateTutorJwtAuthDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tutor JWT auth record' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @Roles(Role.ADMIN, Role.MODERATOR)
  async remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
