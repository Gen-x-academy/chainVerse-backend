import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { TutorService } from './tutor.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { LoginTutorDto } from './dto/login-tutor.dto';
import { VerifyTutorEmailDto } from './dto/verify-tutor-email.dto';
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
