import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FinancePermission } from '../domain/finance.enums';
import {
  FinanceAccessGuard,
  RequireFinancePermission,
} from '../guards/finance-access.guard';

/** JWT + tenant-scoped finance permission on a `:organizationId` route. */
export function FinanceAccess(permission: FinancePermission) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, FinanceAccessGuard),
    RequireFinancePermission(permission),
    ApiForbiddenResponse({
      description: `Requires ${permission} in the organization`,
    }),
  );
}

export function FinanceController() {
  return applyDecorators(
    ApiBearerAuth('access-token'),
    ApiParam({
      name: 'organizationId',
      description: 'Owning organization (tenant) id',
    }),
  );
}
