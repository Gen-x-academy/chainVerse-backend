import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AcquisitionOrderService } from '../services/acquisition-order.service';
import { CreateAcquisitionOrderDto } from '../dto/create-acquisition-order.dto';
import { ReceiveAcquisitionOrderDto } from '../dto/receive-acquisition-order.dto';

@ApiTags('E-Library Acquisitions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/acquisitions', 'v1/library/acquisitions'])
export class AcquisitionOrderController {
  constructor(private readonly acquisitionOrderService: AcquisitionOrderService) {}

  @Post()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new acquisition order' })
  create(
    @CurrentUser('sub') createdBy: string,
    @Body() dto: CreateAcquisitionOrderDto,
  ) {
    return this.acquisitionOrderService.create(dto, createdBy);
  }

  @Get()
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'List all acquisition orders (paginated)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.acquisitionOrderService.findAll(paginationDto);
  }

  @Get(':id')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Get an acquisition order by ID' })
  @ApiParam({ name: 'id', description: 'Acquisition order ID' })
  findOne(@Param('id') id: string) {
    return this.acquisitionOrderService.findOne(id);
  }

  @Patch(':id/receive')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Receive items against an acquisition order' })
  @ApiParam({ name: 'id', description: 'Acquisition order ID' })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveAcquisitionOrderDto,
  ) {
    return this.acquisitionOrderService.receive(id, dto);
  }

  @Patch(':id/cancel')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel an acquisition order' })
  @ApiParam({ name: 'id', description: 'Acquisition order ID' })
  cancel(@Param('id') id: string) {
    return this.acquisitionOrderService.cancel(id);
  }
}
