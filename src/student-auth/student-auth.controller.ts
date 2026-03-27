import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StudentAuthService } from './student-auth.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { LoginStudentDto } from './dto/login-student.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { ForgetPasswordDto } from './dto/forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

// Auth endpoints are more sensitive to brute-force: tighten to 10 req/min
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('student')
export class StudentAuthController {
  constructor(private readonly studentAuthService: StudentAuthService) {}

  @Post('create')
  create(@Body() dto: CreateStudentDto) {
    return this.studentAuthService.create(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.studentAuthService.verifyEmail(dto);
  }

  @Post('resend-verification-email')
  resendVerificationEmail(@Body() dto: ResendVerificationEmailDto) {
    return this.studentAuthService.resendVerificationEmail(dto);
  }

  @Post('login')
  login(@Body() dto: LoginStudentDto) {
    return this.studentAuthService.login(dto);
  }

  @Post('forget/password')
  forgetPassword(@Body() dto: ForgetPasswordDto, @Req() req: Request) {
    return this.studentAuthService.forgetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('reset/password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.studentAuthService.resetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('refresh-token')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.studentAuthService.refreshToken(dto);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.studentAuthService.logout(dto);
  }
}
