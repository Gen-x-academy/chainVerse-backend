import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LibraryPolicyService } from './library-policy.service';
import { UpdateLibraryPolicyDto } from './dto/update-library-policy.dto';

@ApiTags('E-Library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller(['library/policy', 'v1/library/policy'])
export class LibraryPolicyController {
  constructor(private readonly policyService: LibraryPolicyService) {}

  @Get()
  @ApiOperation({
    summary:
      'Get the current hold/loan/renewal policy (max active holds, duplicate-edition rule, loan/renewal periods, auto-renewal lead time)',
  })
  getPolicy() {
    return this.policyService.getPolicy();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the hold/loan/renewal policy (bumps the policy version)',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  updatePolicy(@Body() dto: UpdateLibraryPolicyDto) {
    return this.policyService.updatePolicy(dto);
  }
}
