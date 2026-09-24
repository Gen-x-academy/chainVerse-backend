import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { DeFiService } from './de-fi.service';
import { QueryProtocolsDto } from './dto/query-protocols.dto';

@Public()
@ApiTags('DeFi (Public)')
@Controller('protocols/defi')
export class DeFiController {
  constructor(private readonly deFiService: DeFiService) {}

  @Get()
  @ApiOperation({ summary: 'Discover available DeFi protocols' })
  discover(@Query() query: QueryProtocolsDto) {
    return this.deFiService.discoverProtocols(query);
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get metadata for a specific protocol by name' })
  findOne(@Param('name') name: string) {
    return this.deFiService.findOneByName(name);
  }
}
