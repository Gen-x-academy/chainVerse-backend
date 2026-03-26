import { Body, Controller, Post } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';

@Controller('student')
export class GoogleAuthController {
  constructor(private readonly service: GoogleAuthService) {}

  @Post('register/google-auth')
  register(@Body() payload: GoogleAuthDto) {
    return this.service.register(payload);
  }

  @Post('login/google-auth')
  login(@Body() payload: GoogleAuthDto) {
    return this.service.login(payload);
  }
}
