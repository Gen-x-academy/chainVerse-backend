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
import { PrivacyPolicyManagementService } from './privacy-policy-management.service';
import { PRIVACY_POLICY_CACHE_KEY } from './privacy-policy-management.service';
import { CreatePrivacyPolicyManagementDto } from './dto/create-privacy-policy-management.dto';
import { UpdatePrivacyPolicyManagementDto } from './dto/update-privacy-policy-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth('access-token')
@Controller('privacy-policy')
export class PrivacyPolicyManagementController {
  constructor(private readonly service: PrivacyPolicyManagementService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(PRIVACY_POLICY_CACHE_KEY)
  @CacheTTL(3600000)
  @ApiOperation({ summary: 'Get privacy policy (cached, 1 hr TTL)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(3600000)
  @ApiOperation({ summary: 'Get privacy policy entry (cached, 1 hr TTL)' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreatePrivacyPolicyManagementDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id') id: string,
    @Body() payload: UpdatePrivacyPolicyManagementDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
