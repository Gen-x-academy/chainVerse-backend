import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { CourseDiscoveryService } from './course-discovery.service';
import { SearchCoursesDto } from './dto/search-courses.dto';

@ApiTags('Courses (Public)')
@Controller('courses')
export class CourseDiscoveryController {
  constructor(private readonly courseDiscoveryService: CourseDiscoveryService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter courses' })
  search(@Query() dto: SearchCoursesDto) {
    return this.courseDiscoveryService.search(dto);
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured courses' })
  getFeatured(@Query('limit') limit?: number) {
    return this.courseDiscoveryService.getFeatured(limit ? parseInt(String(limit), 10) : 10);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories with course counts' })
  getCategories() {
    return this.courseDiscoveryService.getCategories();
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Get courses by category' })
  getByCategory(
    @Param('category') category: string,
    @Query('limit') limit?: number,
  ) {
    return this.courseDiscoveryService.getByCategory(
      category,
      limit ? parseInt(String(limit), 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single course by ID' })
  findOne(@Param('id') id: string) {
    return this.courseDiscoveryService.findOne(id);
  }

  @Get('tutor/:tutorId')
  @ApiOperation({ summary: 'Get all published courses by a tutor' })
  findByTutor(@Param('tutorId') tutorId: string) {
    return this.courseDiscoveryService.findByTutorPublic(tutorId);
  }
}
