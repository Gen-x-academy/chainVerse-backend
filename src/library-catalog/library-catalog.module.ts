import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { LibraryCatalogController } from './library-catalog.controller';
import { LibraryCatalogService } from './library-catalog.service';
import { Book, BookSchema } from './schemas/book.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }]),
    HttpModule,
  ],
  controllers: [LibraryCatalogController],
  providers: [LibraryCatalogService],
  exports: [LibraryCatalogService],
})
export class LibraryCatalogModule {}