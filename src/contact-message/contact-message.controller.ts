import { ApiBearerAuth } from '@nestjs/swagger';
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
import { ContactMessageService } from './contact-message.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('contact-messages')
export class ContactMessageController {
  constructor(private readonly service: ContactMessageService) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get(':id')
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Public()
  @Post()
  create(@Body() payload: CreateContactMessageDto) {
    return this.service.create(payload);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  @Patch(':id')
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateContactMessageDto,
  ) {
    return this.service.update(id, payload);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Delete(':id')
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
