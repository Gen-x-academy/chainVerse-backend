import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BorrowerPreferenceService } from '../services/borrower-preference.service';
import { UpsertBorrowerPreferenceDto } from '../dto/upsert-borrower-preference.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Borrower Preferences')
@Controller('e-library/borrower-preferences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BorrowerPreferenceController {
  constructor(
    private readonly borrowerPreferenceService: BorrowerPreferenceService,
  ) {}

  @Get()
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get borrower library preferences for the current user' })
  getPreferences(@CurrentUser('sub') patronId: string) {
    return this.borrowerPreferenceService.getPreferences(patronId);
  }

  @Post()
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Upsert borrower library preferences' })
  upsert(
    @CurrentUser('sub') patronId: string,
    @Body() dto: UpsertBorrowerPreferenceDto,
  ) {
    return this.borrowerPreferenceService.upsert(patronId, dto);
  }
}
