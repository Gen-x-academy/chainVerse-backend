import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';

export class ReceiveOrderItemDto {
  @ApiProperty({ description: 'Index of the item in the order items array', example: 0 })
  @IsInt()
  @Min(0)
  orderItemIndex: number;

  @ApiProperty({ description: 'Quantity received for this item', example: 3 })
  @IsInt()
  @Min(0)
  quantityReceived: number;
}

export class ReceiveAcquisitionOrderDto {
  @ApiProperty({ type: [ReceiveOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveOrderItemDto)
  items: ReceiveOrderItemDto[];
}
