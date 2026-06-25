import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';

@Controller('student')
export class GoogleAuthController {
  constructor(private readonly service: GoogleAuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/google-auth')
  register(@Body() payload: GoogleAuthDto) {
    return this.service.register(payload);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login/google-auth')
  login(@Body() payload: GoogleAuthDto) {
    return this.service.login(payload);
  }
}
