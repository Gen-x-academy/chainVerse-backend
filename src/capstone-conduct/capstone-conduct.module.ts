import { Module } from '@nestjs/common';
import { ConductAuditService } from './capstone-conduct-audit.service';
import { CapstoneConductController } from './capstone-conduct.controller';
import { CapstoneConductRepository } from './capstone-conduct.repository';
import { CapstoneConductService } from './capstone-conduct.service';

/**
 * CAPSTONE-055 — Capstone code of conduct.
 *
 * Additive, in-memory and tenant-keyed; needs no migration. Other capstone
 * modules enforce acceptance by importing this module and calling
 * `CapstoneConductService.assertCompliant`. Provide `CONDUCT_NOTIFIER` to
 * deliver re-acknowledgement notices; it is optional.
 */
@Module({
  controllers: [CapstoneConductController],
  providers: [
    CapstoneConductService,
    CapstoneConductRepository,
    ConductAuditService,
  ],
  exports: [CapstoneConductService],
})
export class CapstoneConductModule {}
