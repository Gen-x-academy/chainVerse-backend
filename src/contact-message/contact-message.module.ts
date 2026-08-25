import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ContactMessage,
  ContactMessageSchema,
} from './schemas/contact-message.schema';
import { ContactMessageController } from './contact-message.controller';
import { ContactMessageService } from './contact-message.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContactMessage.name, schema: ContactMessageSchema },
    ]),
  ],
  controllers: [ContactMessageController],
  providers: [ContactMessageService],
})
export class ContactMessageModule {}
