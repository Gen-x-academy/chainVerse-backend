import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { Session, SessionSchema } from './schemas/session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
  ],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
