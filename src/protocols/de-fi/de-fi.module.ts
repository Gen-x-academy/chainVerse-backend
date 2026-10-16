import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeFiController } from './de-fi.controller';
import { DeFiService, PROTOCOL_ADAPTERS } from './de-fi.service';
import {
  ProtocolMetadata,
  ProtocolMetadataSchema,
} from './schemas/protocol-metadata.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProtocolMetadata.name, schema: ProtocolMetadataSchema },
    ]),
  ],
  controllers: [DeFiController],
  providers: [DeFiService, { provide: PROTOCOL_ADAPTERS, useValue: [] }],
  exports: [DeFiService],
})
export class DeFiModule {}
