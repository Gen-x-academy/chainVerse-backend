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
import { ContactMessageService } from './contact-message.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Contact Messages')
@Controller('contact-messages')
export class ContactMessageController {
  constructor(private readonly service: ContactMessageService) {}

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all contact messages (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'List of contact messages' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a single contact message by id (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'The requested contact message' })
  @ApiResponse({ status: 400, description: 'Invalid id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Contact message not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Get(':id')
  findOne(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Public()
  @ApiOperation({ summary: 'Submit a contact message' })
  @ApiResponse({ status: 201, description: 'Contact message created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @Post()
  create(@Body() payload: CreateContactMessageDto) {
    return this.service.create(payload);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a contact message (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Contact message updated' })
  @ApiResponse({ status: 400, description: 'Invalid id or validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Contact message not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Patch(':id')
  update(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() payload: UpdateContactMessageDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.update(id, payload, userId);
  }

  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a contact message (admin/moderator only)' })
  @ApiResponse({ status: 200, description: 'Contact message deleted' })
  @ApiResponse({ status: 400, description: 'Invalid id' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Contact message not found' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @Delete(':id')
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}
