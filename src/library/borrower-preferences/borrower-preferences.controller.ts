import {
  Body,
  Controller,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BorrowerPreferencesService } from './borrower-preferences.service';
import { UpsertBorrowerPreferenceDto } from './dto/upsert-borrower-preference.dto';

@ApiTags('Library / Borrower Preferences')
@ApiBearerAuth()
@Controller('library/preferences')
export class BorrowerPreferencesController {
  constructor(private readonly service: BorrowerPreferencesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my library notification preferences' })
  getMyPreferences(@Request() req: { user: { id: string } }) {
    return this.service.findOrCreate(req.user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Update my library notification preferences' })
  updateMyPreferences(
    @Request() req: { user: { id: string } },
    @Body() dto: UpsertBorrowerPreferenceDto,
  ) {
    return this.service.upsert(req.user.id, dto);
  }
}