import { Module } from '@nestjs/common';
import { ContactMessageController } from './contact-message.controller';
import { ContactMessageService } from './contact-message.service';

@Module({
  controllers: [ContactMessageController],
  providers: [ContactMessageService],
})
export class ContactMessageModule {}
