import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RelatedBooksService } from '../services/related-books.service';
import { RelatedBooksQueryDto } from '../dto/related-books-query.dto';

@ApiTags('E-Library Discovery')
@Public()
@Controller(['library/catalog', 'v1/library/catalog'])
export class RelatedBooksController {
  constructor(private readonly relatedBooksService: RelatedBooksService) {}

  @Get(':id/related')
  @ApiOperation({ summary: 'Get books related to a given book' })
  @ApiResponse({ status: 200, description: 'Related books' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  getRelated(
    @Param('id') id: string,
    @Query() query: RelatedBooksQueryDto,
  ) {
    return this.relatedBooksService.getRelatedBooks(id, query.limit);
  }

  @Get('author/:author')
  @ApiOperation({ summary: 'Get other books by the same author' })
  @ApiResponse({ status: 200, description: 'Books by the same author' })
  getSameAuthor(
    @Param('author') author: string,
    @Query() query: RelatedBooksQueryDto,
  ) {
    return this.relatedBooksService.getSameAuthorBooks(author, query.limit);
  }
}
