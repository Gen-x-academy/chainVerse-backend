import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
import { FAQ_CACHE_KEY } from './faq-management.service';
import { CreateFaqManagementDto } from './dto/create-faq-management.dto';
import { UpdateFaqManagementDto } from './dto/update-faq-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth('access-token')
@Controller('faq')
export class FaqManagementController {
  constructor(private readonly service: FaqManagementService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(FAQ_CACHE_KEY)
  @CacheTTL(600000)
  @ApiOperation({ summary: 'List all FAQs (cached, 10 min TTL)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(600000)
  @ApiOperation({ summary: 'Get single FAQ entry (cached, 10 min TTL)' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateFaqManagementDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(@Param('id') id: string, @Body() payload: UpdateFaqManagementDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
