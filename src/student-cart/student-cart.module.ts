import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentCartController } from './student-cart.controller';
import { StudentCartService } from './student-cart.service';
import { CartItem, CartItemSchema } from './schemas/cart-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CartItem.name, schema: CartItemSchema },
    ]),
  ],
  controllers: [StudentCartController],
  providers: [StudentCartService],
})
export class StudentCartModule {}
