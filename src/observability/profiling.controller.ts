import { 
  Controller, 
  Post, 
  Get, 
  HttpStatus, 
  HttpException,
  Res,
  Param
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Public } from '../common/decorators/public.decorator';
import { SkipKyc } from '../common/decorators/skip-kyc.decorator';
import { ProfilingService } from './profiling.service';

@ApiTags('Profiling')
@Controller('profiling')
@Public()
@SkipKyc()
export class ProfilingController {
  constructor(private readonly profilingService: ProfilingService) {}

  @Post('cpu/start')
  @ApiOperation({ 
    summary: 'Start CPU profiling',
    description: 'Starts collecting CPU profiling data to identify hot functions and bottlenecks'
  })
  @ApiResponse({ status: 200, description: 'CPU profiling started successfully' })
  async startCpuProfiling() {
    const result = await this.profilingService.startCpuProfiling();
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('cpu/stop')
  @ApiOperation({ 
    summary: 'Stop CPU profiling',
    description: 'Stops CPU profiling and returns the profile file that can be downloaded'
  })
  @ApiResponse({ status: 200, description: 'CPU profiling stopped and profile saved' })
  async stopCpuProfiling() {
    const result = await this.profilingService.stopCpuProfiling();
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('heap/snapshot')
  @ApiOperation({ 
    summary: 'Take heap snapshot',
    description: 'Captures a heap snapshot that can be analyzed for memory leaks and memory usage patterns'
  })
  @ApiResponse({ status: 200, description: 'Heap snapshot created successfully' })
  async takeHeapSnapshot() {
    const result = await this.profilingService.takeHeapSnapshot();
    if (!result.success) {
      throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('profiles')
  @ApiOperation({ 
    summary: 'List all available profiles',
    description: 'Returns a list of all saved CPU profiles and heap snapshots'
  })
  @ApiResponse({ status: 200, description: 'List of available profiles' })
  listProfiles() {
    const profiles = this.profilingService.getAvailableProfiles();
    return { profiles };
  }

  @Get('profiles/:filename')
  @ApiOperation({ 
    summary: 'Download a profile file',
    description: 'Downloads a specific profile or heap snapshot file for analysis'
  })
  @ApiResponse({ status: 200, description: 'Profile file stream' })
  async downloadProfile(
    @Param('filename') filename: string,
    @Res() res: Response
  ) {
    const profilesDir = join(process.cwd(), 'profiles');
    const filePath = join(profilesDir, filename);

    if (!existsSync(filePath)) {
      throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    }

    // Security check: prevent path traversal
    const normalizedPath = join(profilesDir, filename);
    if (!normalizedPath.startsWith(profilesDir)) {
      throw new HttpException('Invalid filename', HttpStatus.BAD_REQUEST);
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = createReadStream(filePath);
    fileStream.pipe(res);
  }

  @Get('memory/health')
  @ApiOperation({ 
    summary: 'Check memory health',
    description: 'Returns current memory usage and detects potential memory leaks'
  })
  @ApiResponse({ status: 200, description: 'Memory health status' })
  checkMemoryHealth() {
    return this.profilingService.checkMemoryHealth();
  }
}