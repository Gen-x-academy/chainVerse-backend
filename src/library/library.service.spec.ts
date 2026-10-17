import { LibraryService } from './library.service';

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(() => {
    service = new LibraryService();
  });

  it('reports the library module as healthy', () => {
    expect(service.health()).toEqual({ status: 'ok', module: 'library' });
  });
});
