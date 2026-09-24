import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LibraryCatalogService } from './library-catalog.service';
import { CreateBookDto } from './dto/create-book.dto';
import { CreateBookCopyDto } from './dto/create-book-copy.dto';
import { CreateClosureDto } from './dto/create-closure.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@ApiTags('E-Library Catalog')
@ApiBearerAuth('access-token')
@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryCatalogController {
  constructor(private readonly catalogService: LibraryCatalogService) {}

  @Post('books')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Register a new book title and provision its initial lendable copies/licenses',
  })
  createBook(@Body() dto: CreateBookDto) {
    return this.catalogService.createBook(dto);
  }

  @Get('books')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
  @ApiOperation({
    summary: 'List active book titles available in the e-library',
  })
  listBooks() {
    return this.catalogService.listBooks();
  }

  @Get('books/:bookId')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR, Role.STUDENT)
  @ApiOperation({ summary: 'Get a book title by id' })
  getBook(@Param('bookId', new ParseObjectIdPipe()) bookId: string) {
    return this.catalogService.getBook(bookId);
  }

  @Post('books/:bookId/copies')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Add a lendable copy or license seat to a book title',
  })
  addCopy(
    @Param('bookId', new ParseObjectIdPipe()) bookId: string,
    @Body() dto: CreateBookCopyDto,
  ) {
    return this.catalogService.addCopy(bookId, dto);
  }

  @Get('books/:bookId/copies')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List lendable copies/licenses for a book title' })
  listCopies(@Param('bookId', new ParseObjectIdPipe()) bookId: string) {
    return this.catalogService.listCopies(bookId);
  }

  @Post('closures')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Register a library closure date that extends physical-hold pickup windows',
  })
  createClosure(@Body() dto: CreateClosureDto) {
    return this.catalogService.createClosure(dto);
  }

  @Get('closures')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List registered library closure dates' })
  listClosures() {
    return this.catalogService.listClosures();
  }
}
