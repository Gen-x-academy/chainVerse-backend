import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
@ApiTags('Student Auth')
@Controller('student')
export class StudentAuthController {
  constructor(private readonly studentAuthService: StudentAuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new student' })
  @ApiBody({ type: CreateStudentDto })
  @ApiResponse({ status: 201, description: 'Student registered. Verification email sent.' })
  @ApiResponse({ status: 400, description: 'Invalid input or missing fields' })
  @ApiResponse({ status: 409, description: 'Email already registered.' })
  create(@Body() dto: CreateStudentDto) {
    return this.studentAuthService.create(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify student email with token' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.studentAuthService.verifyEmail(dto);
  }

  @Post('resend-verification-email')
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiBody({ type: ResendVerificationEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent if account exists',
  })
  @ApiResponse({
    status: 400,
    description: 'Email already verified or cooldown active',
  })
  resendVerificationEmail(@Body() dto: ResendVerificationEmailDto) {
    return this.studentAuthService.resendVerificationEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Authenticate a student and receive tokens' })
  @ApiBody({ type: LoginStudentDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access and refresh tokens',
  })
  @ApiResponse({ status: 400, description: 'Missing credentials' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or unverified email',
  })
  login(@Body() dto: LoginStudentDto) {
    return this.studentAuthService.login(dto);
  }

  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiBody({ type: ForgetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Reset link sent if account exists',
  })
  @ApiResponse({ status: 400, description: 'Missing or invalid email' })
  forgetPassword(@Body() dto: ForgetPasswordDto, @Req() req: Request) {
    return this.studentAuthService.forgetPassword(
      dto,
      (req as any).ip,
      req.headers['user-agent'],
    );
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a valid reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token, or weak password',
  })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.studentAuthService.resetPassword(
      dto,
      (req as any).ip,
      req.headers['user-agent'],
    );
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Rotate refresh token and get a new token pair' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'New access and refresh tokens issued',
  })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.studentAuthService.refreshToken(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Invalidate the current refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 400, description: 'Missing refresh token' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.studentAuthService.logout(dto);
  }
}
