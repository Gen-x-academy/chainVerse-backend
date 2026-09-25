import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @IsNotEmpty()
  @IsString()
  barcode: string;

  /**
   * Patron to check the item out to. Required for staff-assisted checkout;
   * ignored for self-service (the authenticated student is always the
   * patron in that case).
   */
  @IsOptional()
  @IsString()
  patronId?: string;
}
