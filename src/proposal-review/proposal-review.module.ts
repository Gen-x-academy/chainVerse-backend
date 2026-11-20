import { Module } from '@nestjs/common';
import { ProposalReviewController } from './proposal-review.controller';
import { ProposalReviewRepository } from './proposal-review.repository';
import { ProposalReviewService } from './proposal-review.service';

@Module({
  controllers: [ProposalReviewController],
  providers: [ProposalReviewService, ProposalReviewRepository],
  exports: [ProposalReviewService],
})
export class ProposalReviewModule {}
