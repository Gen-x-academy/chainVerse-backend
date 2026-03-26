import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateFinancialAidDto } from './dto/create-financial-aid.dto';
import { UpdateFinancialAidDto } from './dto/update-financial-aid.dto';
import { ApplyForFinancialAidUseCase } from './use-cases/apply-for-financial-aid.use-case';
import { FindFinancialAidApplicationsUseCase } from './use-cases/find-financial-aid-applications.use-case';
import { ReviewFinancialAidApplicationUseCase } from './use-cases/review-financial-aid-application.use-case';
import { DeleteFinancialAidApplicationUseCase } from './use-cases/delete-financial-aid-application.use-case';

/**
 * HTTP transport layer for the financial-aid domain.
 *
 * Each handler is intentionally thin: it authenticates, extracts input from
 * the request, delegates to the relevant use-case, and returns the result.
 * No persistence or domain logic lives here.
 */
@Controller('financial-aid')
export class FinancialAidController {
  constructor(
    private readonly applyUseCase: ApplyForFinancialAidUseCase,
    private readonly findUseCase: FindFinancialAidApplicationsUseCase,
    private readonly reviewUseCase: ReviewFinancialAidApplicationUseCase,
    private readonly deleteUseCase: DeleteFinancialAidApplicationUseCase,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  create(@Body() payload: CreateFinancialAidDto) {
    return this.applyUseCase.execute(payload);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  findMyApplications(@Req() req: { user: { id: string } }) {
    return this.findUseCase.findByStudentId(req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll() {
    return this.findUseCase.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.STUDENT)
  findOne(@Param('id') id: string) {
    return this.findUseCase.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(@Param('id') id: string, @Body() payload: UpdateFinancialAidDto) {
    return this.reviewUseCase.execute(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.deleteUseCase.execute(id);
  }
}
