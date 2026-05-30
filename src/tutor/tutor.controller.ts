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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TutorService } from './tutor.service';
import { CreateTutorDto } from './dto/create-tutor.dto';
import { LoginTutorDto } from './dto/login-tutor.dto';
import { VerifyTutorEmailDto } from './dto/verify-tutor-email.dto';
import { ForgetTutorPasswordDto } from './dto/forget-tutor-password.dto';
import { ResetTutorPasswordDto } from './dto/reset-tutor-password.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Tutor Auth')
@Controller('tutor')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Post('create')
  @ApiOperation({ summary: 'Register a new tutor' })
  @ApiBody({ type: CreateTutorDto })
  @ApiResponse({ status: 201, description: 'Tutor registered. Verification email sent.' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  create(@Body() dto: CreateTutorDto) {
    return this.tutorService.create(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate a tutor and receive tokens' })
  @ApiBody({ type: LoginTutorDto })
  @ApiResponse({ status: 200, description: 'Login successful, returns access and refresh tokens' })
  @ApiResponse({ status: 400, description: 'Missing credentials' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or unverified email' })
  login(@Body() dto: LoginTutorDto) {
    return this.tutorService.login(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify tutor email with token' })
  @ApiBody({ type: VerifyTutorEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  verifyEmail(@Body() dto: VerifyTutorEmailDto) {
    return this.tutorService.verifyEmail(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiBody({ type: ForgetTutorPasswordDto })
  @ApiResponse({ status: 200, description: 'Reset link sent if account exists' })
  @ApiResponse({ status: 400, description: 'Missing or invalid email' })
  forgetPassword(@Body() dto: ForgetTutorPasswordDto, @Req() req: Request) {
    return this.tutorService.forgetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a valid reset token' })
  @ApiBody({ type: ResetTutorPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token, or weak password' })
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
