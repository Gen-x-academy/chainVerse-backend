import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ClosureCalendarService } from '../services/closure-calendar.service';
import { CreateClosureCalendarDto } from '../dto/closure-calendar.dto';

@ApiTags('E-Library Circulation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/closures', 'v1/library/closures'])
export class ClosureCalendarController {
  constructor(private readonly closureService: ClosureCalendarService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Register a closure date range' })
  @ApiResponse({ status: 201, description: 'Closure registered' })
  createClosure(
    @Body() dto: CreateClosureCalendarDto,
  ) {
    return this.closureService.createClosure(dto, 'system');
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'List all closure dates' })
  listClosures() {
    return this.closureService.listClosures();
  }

  @Delete(':closureId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a closure date' })
  deleteClosure(@Body('closureId') closureId: string) {
    return this.closureService.deleteClosure(closureId);
  }
}
