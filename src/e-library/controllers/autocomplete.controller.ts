import { Controller, Get, HttpCode, Query, UseInterceptors, ValidationPipe } from '@nestjs/common';
import { ThrottlerInterceptor } from '@nestjs/throttler';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AutocompleteService } from '../services/autocomplete.service';
import { AutocompleteQueryDto, AutocompleteField } from '../dto/autocomplete-query.dto';

@ApiTags('E-Library Discovery')
@Controller(['library/catalog/autocomplete', 'v1/library/catalog/autocomplete'])
@UseInterceptors(ThrottlerInterceptor)
export class AutocompleteController {
  constructor(private readonly autocompleteService: AutocompleteService) {}

  @Get()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Autocomplete suggestions for titles, authors, subjects, and ISBNs' })
  @ApiQuery({ name: 'q', required: true, description: 'Prefix to match (min 2, max 100 chars)', example: 'mach' })
  @ApiQuery({ name: 'field', required: false, enum: AutocompleteField, default: AutocompleteField.TITLE })
  @ApiQuery({ name: 'limit', required: false, description: 'Max suggestions (max 25)', default: 10 })
  @ApiResponse({ status: 200, description: 'Ranked, deduplicated suggestions' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  suggest(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AutocompleteQueryDto,
  ) {
    return this.autocompleteService.suggest(dto);
  }
}
