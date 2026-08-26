import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BookReviewService } from '../services/book-review.service';
import { CreateBookReviewDto } from '../dto/create-book-review.dto';
import { UpdateBookReviewDto } from '../dto/update-book-review.dto';
import { ReviewStatus } from '../schemas/book-review.schema';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Book Reviews')
@Controller('e-library/book-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookReviewController {
  constructor(private readonly bookReviewService: BookReviewService) {}

  @Post()
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Create a book review' })
  create(
    @CurrentUser('sub') patronId: string,
    @Body() dto: CreateBookReviewDto,
  ) {
    return this.bookReviewService.create(dto, patronId);
  }

  @Get('book/:bookId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'List published reviews for a book' })
  listByBook(
    @Param('bookId') bookId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.bookReviewService.listByBook(bookId, paginationDto);
  }

  @Get(':id')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Get a book review by ID' })
  findOne(@Param('id') id: string) {
    return this.bookReviewService.findById(id);
  }

  @Put(':id')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update own book review' })
  update(
    @Param('id') id: string,
    @CurrentUser('sub') patronId: string,
    @Body() dto: UpdateBookReviewDto,
  ) {
    return this.bookReviewService.update(id, dto, patronId);
  }

  @Put(':id/moderate')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Moderate a review status (flag/remove/publish)' })
  moderate(
    @Param('id') id: string,
    @Body('status') status: ReviewStatus,
  ) {
    return this.bookReviewService.moderateStatus(id, status);
  }
}
