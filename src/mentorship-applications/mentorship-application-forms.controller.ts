import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { MentorshipApplicationFormsService } from './mentorship-application-forms.service';
import { PublishFormDto } from './dto/publish-form.dto';

@ApiTags('Mentorship Applications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mentorship/programs/:programId/application-form')
export class MentorshipApplicationFormsController {
  constructor(private readonly forms: MentorshipApplicationFormsService) {}

  @Get()
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get the accepted application form for a program' })
  @ApiNotFoundResponse({ description: 'RES_MENTORSHIP_FORM_NOT_FOUND' })
  getCurrent(@Param('programId') programId: string) {
    return this.forms.getCurrentOrThrow(programId);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Publish a new form version and make it the accepted one' })
  publish(
    @Req() req: { user: { id: string } },
    @Param('programId') programId: string,
    @Body() dto: PublishFormDto,
  ) {
    return this.forms.publish(programId, dto, req.user.id);
  }
}
