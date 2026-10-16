import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { BooksService } from '../books.service';
import { CoverImageService } from '../services/cover-image.service';
import { UpdateAccessibilityDto } from '../dto/update-accessibility.dto';

/**
 * Staff-facing catalog administration endpoints for accessibility metadata
 * (#999) and cover image ingestion (#998).
 */
@ApiTags('E-Library Catalog Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/catalog', 'v1/library/catalog'])
export class CatalogAdminController {
  constructor(
    private readonly booksService: BooksService,
    private readonly coverImageService: CoverImageService,
  ) {}

  /**
   * Issue #999 – update accessible alternate-format metadata.
   */
  @Patch(':id/accessibility')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Update accessible alternate-format metadata for a book' })
  @ApiResponse({ status: 200, description: 'Metadata updated' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  updateAccessibility(
    @Param('id') id: string,
    @Body() dto: UpdateAccessibilityDto,
  ) {
    return this.booksService.updateAccessibility(id, dto);
  }

  /**
   * Issue #998 – ingest a cover image with safe transformation.
   */
  @Post(':id/cover')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @UseInterceptors(FileInterceptor('cover', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ingest and store a cover image (PNG/JPEG/WebP, <=5MiB)' })
  @ApiResponse({ status: 201, description: 'Cover stored under a stable URL' })
  @ApiResponse({ status: 400, description: 'Invalid image or over size limit' })
  ingestCover(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.coverImageService.ingest(id, file?.buffer);
  }

  /**
   * Issue #998 – remove a previously stored cover image.
   */
  @Delete(':id/cover')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Remove the cover image for a book' })
  @ApiResponse({ status: 200, description: 'Cover removed' })
  removeCover(@Param('id') id: string) {
    return this.coverImageService.remove(id);
  }
}
