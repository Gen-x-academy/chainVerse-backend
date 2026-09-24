import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';

@ApiTags('E-Library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/books', 'v1/library/books'])
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Register a book edition in the library catalog' })
  @ApiResponse({ status: 403, description: 'Caller is not staff' })
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
  @ApiOperation({ summary: 'List book editions in the library catalog' })
  list(@Query() paginationDto: PaginationDto) {
    return this.booksService.list(paginationDto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
  @ApiOperation({ summary: 'Get a single book edition by id' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  findOne(@Param('id') id: string) {
    return this.booksService.findByIdOrThrow(id);
  }
}
