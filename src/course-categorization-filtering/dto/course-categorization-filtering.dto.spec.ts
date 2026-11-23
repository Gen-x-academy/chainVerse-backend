import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateCourseCategorizationFilteringDto } from './create-course-categorization-filtering.dto';
import { SearchCourseDto } from './search-course.dto';
import { UpdateCourseCategorizationFilteringDto } from './update-course-categorization-filtering.dto';

/** Mirrors the global ValidationPipe configured in src/main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown, metatype: new () => object) =>
  pipe.transform(body, { type: 'body', metatype });

describe('course categorization/filtering DTO validation', () => {
  describe('CreateCourseCategorizationFilteringDto', () => {
    const metatype = CreateCourseCategorizationFilteringDto;

    it('accepts a valid payload', async () => {
      await expect(
        validate(
          {
            title: 'Intro to Blockchain',
            description: 'A beginner course',
            metadata: { category: 'web3', level: 'beginner' },
          },
          metatype,
        ),
      ).resolves.toMatchObject({ title: 'Intro to Blockchain' });
    });

    it.each([
      ['a missing title', { description: 'no title' }],
      ['an empty title', { title: '' }],
      ['an over-long title', { title: 't'.repeat(201) }],
      ['a non-string title', { title: null }],
      ['an over-long description', { title: 'ok', description: 'd'.repeat(2001) }],
      ['a non-string description', { title: 'ok', description: null }],
      ['a non-object metadata', { title: 'ok', metadata: ['web3'] }],
      ['a scalar metadata', { title: 'ok', metadata: 123 }],
      ['an unknown field', { title: 'ok', ownerId: 'someone-else' }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, metatype)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('UpdateCourseCategorizationFilteringDto', () => {
    const metatype = UpdateCourseCategorizationFilteringDto;

    it('accepts an empty patch and a partial patch', async () => {
      await expect(validate({}, metatype)).resolves.toBeDefined();
      await expect(
        validate({ description: 'updated description' }, metatype),
      ).resolves.toMatchObject({ description: 'updated description' });
    });

    it.each([
      ['an invalid title', { title: '' }],
      ['an invalid metadata', { metadata: 123 }],
      ['an unknown field', { published: true }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, metatype)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('SearchCourseDto', () => {
    const metatype = SearchCourseDto;

    it('accepts an empty query and a fully populated query', async () => {
      await expect(validate({}, metatype)).resolves.toBeDefined();
      await expect(
        validate(
          {
            query: 'blockchain',
            category: 'web3',
            level: 'beginner',
            tags: ['defi', 'nft'],
          },
          metatype,
        ),
      ).resolves.toMatchObject({ tags: ['defi', 'nft'] });
    });

    it.each([
      ['an over-long query', { query: 'q'.repeat(201) }],
      ['an over-long category', { category: 'c'.repeat(121) }],
      ['an over-long level', { level: 'l'.repeat(121) }],
      ['a non-array tags value', { tags: 'defi' }],
      ['a non-string tag entry', { tags: [1] }],
      ['an unknown field', { sortBy: 'createdAt' }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, metatype)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
