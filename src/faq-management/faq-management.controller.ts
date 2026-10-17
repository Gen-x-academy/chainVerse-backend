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
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { FaqManagementService } from './faq-management.service';
import { CreateFaqManagementDto } from './dto/create-faq-management.dto';
import { UpdateFaqManagementDto } from './dto/update-faq-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('FAQ Management')
@ApiBearerAuth('access-token')
@Controller('faq')
export class FaqManagementController {
  constructor(private readonly service: FaqManagementService) {}

  @Public()
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey('/api/v1/faq')
  @CacheTTL(600000)
  @ApiOperation({ summary: 'List all FAQs (cached, 10 min TTL)' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600000)
  @ApiOperation({ summary: 'Get single FAQ entry (cached, 10 min TTL)' })
  @ApiResponse({ status: 200, description: 'FAQ found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new FAQ entry' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateFaqManagementDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing FAQ entry' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateFaqManagementDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an FAQ entry' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
