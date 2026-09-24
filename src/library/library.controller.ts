import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LibraryService } from './library.service';

@ApiTags('library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('health')
  @ApiOperation({ summary: 'Library module health check' })
  health() {
    return this.libraryService.health();
  }
}
