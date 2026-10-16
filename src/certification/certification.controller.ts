import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequestActor } from '../common/auth/resource-owner';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CertificationService } from './certification.service';
import { CertificateDownloadLinkDto } from './dto/certificate-download-link.dto';

@ApiTags('Certification')
@Controller(['certification', 'v1/certification'])
export class CertificationController {
  constructor(private readonly certificationService: CertificationService) {}

  @Post(':id/download-link')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Create a signed, expiring download link for a certificate',
  })
  createDownloadLink(
    @Param('id') id: string,
    @CurrentUser('sub') requesterId: string,
    @CurrentUser('role') role: string,
  ): Promise<CertificateDownloadLinkDto> {
    return this.certificationService.createDownloadLink(id, {
      id: requesterId,
      role,
    } satisfies RequestActor);
  }

  @Public()
  @Get(':id/download')
  @ApiOperation({
    summary: 'Download a certificate using a signed, expiring token',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Signed download token returned by POST /:id/download-link',
  })
  async downloadCertificate(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
  ): Promise<StreamableFile> {
    const fileBuffer = await this.certificationService.downloadCertificate(
      id,
      token,
    );
    return new StreamableFile(fileBuffer, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="certificate-${id}.txt"`,
    });
  }
}
