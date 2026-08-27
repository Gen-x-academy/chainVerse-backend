import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InventoryService } from '../services/inventory.service';
import { CopyCondition } from '../schemas/book-copy.schema';

class InventoryActionDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  repairCost?: number;

  @IsOptional()
  @IsString()
  condition?: string;
}

/**
 * Issue #997 – Inventory copy workflows: lost, damaged, repair, withdrawn.
 * These transitions remove materials from circulation temporarily or
 * permanently, preserving an audit trail and requiring approval for
 * return-to-service.
 */
@ApiTags('E-Library Inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/inventory', 'v1/library/inventory'])
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Patch(':copyId/damaged')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Mark a copy as damaged after assessment' })
  @ApiBody({ type: InventoryActionDto })
  @ApiResponse({ status: 404, description: 'Copy not found' })
  markDamaged(
    @Param('copyId') copyId: string,
    @Body() dto: InventoryActionDto,
    @CurrentUser('sub') actor: string,
  ) {
    return this.inventoryService.markDamaged(copyId, actor, dto.note);
  }

  @Patch(':copyId/repair')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Send a copy to repair (leaves circulation)' })
  @ApiBody({ type: InventoryActionDto })
  @ApiResponse({ status: 400, description: 'Copy is withdrawn' })
  sendToRepair(
    @Param('copyId') copyId: string,
    @Body() dto: InventoryActionDto,
    @CurrentUser('sub') actor: string,
  ) {
    return this.inventoryService.sendToRepair(
      copyId,
      actor,
      dto.repairCost,
      dto.note,
    );
  }

  @Patch(':copyId/repair/return')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Approve a repaired copy back into service' })
  @ApiBody({ type: InventoryActionDto })
  @ApiResponse({ status: 400, description: 'Copy is not in repair' })
  returnFromRepair(
    @Param('copyId') copyId: string,
    @Body() dto: InventoryActionDto,
    @CurrentUser('sub') actor: string,
  ) {
    const condition = dto.condition as CopyCondition | undefined;
    return this.inventoryService.returnFromRepair(
      copyId,
      actor,
      condition ?? CopyCondition.GOOD,
      dto.note,
    );
  }

  @Patch(':copyId/lost')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Mark a copy as lost (permanently out of circulation)' })
  @ApiBody({ type: InventoryActionDto })
  markLost(
    @Param('copyId') copyId: string,
    @Body() dto: InventoryActionDto,
    @CurrentUser('sub') actor: string,
  ) {
    return this.inventoryService.markLost(copyId, actor, dto.note);
  }

  @Patch(':copyId/withdraw')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Withdraw a copy permanently' })
  @ApiBody({ type: InventoryActionDto })
  withdraw(
    @Param('copyId') copyId: string,
    @Body() dto: InventoryActionDto,
    @CurrentUser('sub') actor: string,
  ) {
    return this.inventoryService.withdraw(copyId, actor, dto.note);
  }
}
