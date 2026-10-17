import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Google Authentication')
@Public()
@Controller()
export class GoogleAuthController {
  constructor(private readonly service: GoogleAuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('student/register/google-auth')
  @Post('register/google-auth')
  @ApiOperation({ summary: 'Register a student with a Google account' })
  @ApiResponse({
    status: 201,
    description: 'Student registered and authentication tokens returned',
  })
  register(@Body() payload: GoogleAuthDto) {
    return this.service.register(payload);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('student/login/google-auth')
  @Post('login/google-auth')
  @ApiOperation({ summary: 'Log a student in with a Google account' })
  @ApiResponse({
    status: 201,
    description: 'Authentication tokens returned',
  })
  login(@Body() payload: GoogleAuthDto) {
    return this.service.login(payload);
  }

  @Get('auth/google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start the Google OAuth redirect flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  async googleAuth() {
    // Guard will trigger redirect
  }

  @Get('auth/google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Handle the Google OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Authentication tokens returned',
  })
  async googleAuthCallback(@Req() req: any, @Res() res: any) {
    const payload: GoogleAuthDto = {
      googleId: req.user.googleId,
      email: req.user.email,
      displayName: req.user.displayName,
      avatarUrl: req.user.avatarUrl,
    };
    try {
      const tokens = await this.service.login(payload);
      return res.json(tokens);
    } catch {
      const tokens = await this.service.register(payload);
      return res.json(tokens);
    }
  }
}
