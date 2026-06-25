import { Body, Controller, Post, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';

@Controller()
export class GoogleAuthController {
  constructor(private readonly service: GoogleAuthService) {}

  @Post('student/register/google-auth')
  register(@Body() payload: GoogleAuthDto) {
    return this.service.register(payload);
  }

  @Post('student/login/google-auth')
  login(@Body() payload: GoogleAuthDto) {
    return this.service.login(payload);
  }

  @Get('auth/google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Guard will trigger redirect
  }

  @Get('auth/google/callback')
  @UseGuards(AuthGuard('google'))
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
