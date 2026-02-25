import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StudentCartService } from './student-cart.service';
import { UpdateStudentCartDto } from './dto/update-student-cart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
export class StudentCartController {
  constructor(private readonly service: StudentCartService) {}

  @Post('cart/:id/add')
  add(
    @Req() req: { user: { id: string } },
    @Param('id') courseId: string,
  ) {
    return this.service.add(req.user.id, courseId);
  }

  @Get('cart')
  getCart(@Req() req: { user: { id: string } }) {
    return this.service.getCart(req.user.id);
  }

  @Patch(':id/cart')
  update(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
    @Body() payload: UpdateStudentCartDto,
  ) {
    return this.service.update(req.user.id, courseId, payload);
  }

  @Delete(':id/cart')
  remove(
    @Param('id') courseId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.remove(req.user.id, courseId);
  }
}
