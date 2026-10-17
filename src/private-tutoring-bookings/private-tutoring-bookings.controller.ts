import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { PrivateTutoringBookingsService } from './private-tutoring-bookings.service';
import { CreatePrivateTutoringBookingsDto } from './dto/create-private-tutoring-bookings.dto';
import { UpdatePrivateTutoringBookingsDto } from './dto/update-private-tutoring-bookings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Private Tutoring Bookings')
@ApiBearerAuth('access-token')
@Controller('tutoring/bookings')
export class PrivateTutoringBookingsController {
  constructor(private readonly service: PrivateTutoringBookingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List private tutoring bookings' })
  @ApiResponse({ status: 200, description: 'Bookings returned' })
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a private tutoring booking by id' })
  @ApiResponse({ status: 200, description: 'Booking returned' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a private tutoring booking' })
  @ApiResponse({ status: 201, description: 'Booking created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreatePrivateTutoringBookingsDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a private tutoring booking' })
  @ApiResponse({ status: 200, description: 'Booking updated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdatePrivateTutoringBookingsDto,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a private tutoring booking' })
  @ApiResponse({ status: 200, description: 'Booking deleted' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
