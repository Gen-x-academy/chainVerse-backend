import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StudentCartService } from './student-cart.service';
import { UpdateStudentCartDto } from './dto/update-student-cart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Student Cart')
@ApiBearerAuth('access-token')
@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentCartController {
  constructor(private readonly service: StudentCartService) {}

  @Post('cart/:id/add')
  @ApiOperation({ summary: 'Add a course to the authenticated student\'s cart' })
  add(@Req() req: { user: { id: string } }, @Param('id', new ParseObjectIdPipe()) courseId: string) {
    return this.service.add(req.user.id, courseId);
  }

  @Get('cart')
  @ApiOperation({ summary: 'Get the authenticated student\'s cart' })
  getCart(@Req() req: { user: { id: string } }) {
    return this.service.getCart(req.user.id);
  }

  @Patch(':id/cart')
  @ApiOperation({ summary: 'Update a course item in the authenticated student\'s cart' })
  update(
    @Param('id', new ParseObjectIdPipe()) courseId: string,
    @Req() req: { user: { id: string } },
    @Body() payload: UpdateStudentCartDto,
  ) {
    return this.service.update(req.user.id, courseId, payload);
  }

  @Delete(':id/cart')
  @ApiOperation({ summary: 'Remove a course from the authenticated student\'s cart' })
  remove(@Param('id', new ParseObjectIdPipe()) courseId: string, @Req() req: { user: { id: string } }) {
    return this.service.remove(req.user.id, courseId);
  }
}
