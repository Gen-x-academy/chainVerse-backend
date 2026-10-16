import { Injectable } from '@nestjs/common';

@Injectable()
export class LibraryService {
  health(): { status: string; module: string } {
    return { status: 'ok', module: 'library' };
  }
}
