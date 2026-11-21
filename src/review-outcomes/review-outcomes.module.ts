import { Module } from '@nestjs/common';
import { ReviewOutcomesAccessGuard } from './review-outcomes-access.guard';
import { ReviewOutcomesController } from './review-outcomes.controller';
import { ReviewOutcomesRepository } from './review-outcomes.repository';
import { ReviewOutcomesService } from './review-outcomes.service';

@Module({
  controllers: [ReviewOutcomesController],
  providers: [
    ReviewOutcomesService,
    ReviewOutcomesRepository,
    ReviewOutcomesAccessGuard,
  ],
  exports: [ReviewOutcomesService, ReviewOutcomesRepository],
})
export class ReviewOutcomesModule {}
