import { Module } from '@nestjs/common';
import { StudentCartController } from './student-cart.controller';
import { StudentCartService } from './student-cart.service';

@Module({
  controllers: [StudentCartController],
  providers: [StudentCartService],
})
export class StudentCartModule {}
