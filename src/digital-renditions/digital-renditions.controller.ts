import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CreateRenditionAccessTokenDto } from './dto/create-rendition-access-token.dto';
import { RenditionAccessTokenResponseDto } from './dto/rendition-access-token-response.dto';
import { DigitalRenditionsService } from './digital-renditions.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('Digital Renditions')
@ApiBearerAuth()
@Controller('digital-renditions')
export class DigitalRenditionsController {
  constructor(private readonly service: DigitalRenditionsService) {}

  /**
   * Issue a temporary single-use access token for a digital rendition.
   */
  @Post(':renditionId/access-token')
  @ApiOperation({
    summary: 'Issue temporary access token',
    description:
      'Creates a short-lived single-use token bound to the authenticated patron, active loan, rendition, purpose, and expiry.',
  })
  @ApiParam({ name: 'renditionId', type: String, format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Access token created.',
    type: RenditionAccessTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({
    status: 403,
    description: 'Patron does not have an active loan.',
  })
  @ApiResponse({ status: 404, description: 'Rendition not found.' })
  async createAccessToken(
    @Req() req: AuthenticatedRequest,
    @Param('renditionId') renditionId: string,
    @Query() dto: CreateRenditionAccessTokenDto,
  ) {
    return this.service.createAccessToken(req.user.id, renditionId, dto);
  }

  /**
   * Consume an access token and stream the digital rendition content.
   * Storage URLs are never exposed to the client.
   */
  @Get(':renditionId/content')
  @ApiOperation({
    summary: 'Access digital rendition',
    description:
      'Consumes a short-lived single-use application access token and streams the rendition through the API. Storage URLs are never exposed.',
  })
  @ApiParam({ name: 'renditionId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'token', type: String, required: true })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Digital rendition content.' })
  @ApiResponse({ status: 401, description: 'Missing or expired token.' })
  @ApiResponse({ status: 403, description: 'Authorization failed.' })
  @ApiResponse({
    status: 404,
    description: 'Token, loan, or rendition not found.',
  })
  @ApiResponse({ status: 409, description: 'Token has already been consumed.' })
  async getContent(
    @Param('renditionId') renditionId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const content = await this.service.consumeAccessToken(
      token,
      renditionId,
      'read',
    );

    res.setHeader('Content-Type', content.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${this.sanitizeFilename(content.filename)}"`,
    );

    if (content.contentLength !== undefined) {
      res.setHeader('Content-Length', content.contentLength);
    }

    // Prevent browser/proxy caching of borrowed content.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');

    content.stream.pipe(res);
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[\r\n"]/g, '')
      .replace(/[\\/]/g, '_')
      .slice(0, 255);
  }
}
