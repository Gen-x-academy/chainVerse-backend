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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SeriesService } from '../services/series.service';
import { CreateSeriesDto } from '../dto/create-series.dto';
import { UpdateVolumeDto } from '../dto/update-volume.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('E-Library Series')
@Controller(['library/catalog/series', 'v1/library/catalog/series'])
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a book series' })
  @ApiResponse({ status: 201, description: 'Series created' })
  create(@Body() dto: CreateSeriesDto) {
    return this.seriesService.createSeries(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List book series' })
  @ApiResponse({ status: 200, description: 'Paginated series list' })
  findAll(@Query() pagination: PaginationDto) {
    return this.seriesService.findAll(pagination);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a single series' })
  @ApiResponse({ status: 200, description: 'Series details' })
  @ApiResponse({ status: 404, description: 'Series not found' })
  findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Get(':id/books')
  @Public()
  @ApiOperation({ summary: 'Get books in a series ordered by volume' })
  @ApiResponse({ status: 200, description: 'Series books with prev/next volume' })
  @ApiResponse({ status: 404, description: 'Series not found' })
  getSeriesBooks(@Param('id') id: string) {
    return this.seriesService.getSeriesBooks(id);
  }

  @Patch(':id/books/:bookId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Assign a book to a series and set its volume' })
  @ApiResponse({ status: 200, description: 'Book updated' })
  @ApiResponse({ status: 404, description: 'Book or series not found' })
  assignBook(
    @Param('id') id: string,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateVolumeDto,
  ) {
    return this.seriesService.assignBookToSeries(bookId, {
      ...dto,
      seriesId: id,
    });
  }
}
