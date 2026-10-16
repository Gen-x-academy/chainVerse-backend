import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Asset {
  @Prop({ required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: String, default: null })
  issuer: string | null;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
