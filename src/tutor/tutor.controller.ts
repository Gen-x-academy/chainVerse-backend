import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { TutorService } from './tutor.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { LoginTutorDto } from './dto/login-tutor.dto';
import { VerifyTutorEmailDto } from './dto/verify-tutor-email.dto';
import { ForgetTutorPasswordDto } from './dto/forget-tutor-password.dto';
import { ResetTutorPasswordDto } from './dto/reset-tutor-password.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tutor')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Post('create')
  create(@Body() dto: CreateTutorDto) {
    return this.tutorService.create(dto);
  }

  @Post('login')
  login(@Body() dto: LoginTutorDto) {
    return this.tutorService.login(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyTutorEmailDto) {
    return this.tutorService.verifyEmail(dto);
  }

  @Post('forget/password')
  forgetPassword(@Body() dto: ForgetTutorPasswordDto, @Req() req: Request) {
    return this.tutorService.forgetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('reset/password')
  resetPassword(@Body() dto: ResetTutorPasswordDto, @Req() req: Request) {
    return this.tutorService.resetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser('sub') tutorId: string) {
    return this.tutorService.getProfile(tutorId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  updateProfile(
    @CurrentUser('sub') tutorId: string,
    @Body() dto: UpdateTutorProfileDto,
  ) {
    return this.tutorService.updateProfile(tutorId, dto);
  }
}
