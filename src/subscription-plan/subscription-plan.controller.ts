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
import { SubscriptionPlanService } from './subscription-plan.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Subscription Plans')
@ApiBearerAuth('access-token')
@Controller('subscription-plans')
export class SubscriptionPlanController {
  constructor(private readonly service: SubscriptionPlanService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Retrieve all subscription plans' })
  @ApiResponse({ status: 200, description: 'List returned successfully' })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific subscription plan' })
  @ApiResponse({ status: 200, description: 'Plan found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a subscription plan' })
  @ApiResponse({ status: 201, description: 'Created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() payload: CreateSubscriptionPlanDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscription plan' })
  @ApiResponse({ status: 200, description: 'Updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateSubscriptionPlanDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
