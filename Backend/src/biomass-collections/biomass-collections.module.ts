import { Module } from '@nestjs/common';
import { BiomassCollectionsController } from './biomass-collections.controller';
import { BiomassCollectionsService } from './biomass-collections.service';

@Module({
  controllers: [BiomassCollectionsController],
  providers: [BiomassCollectionsService],
})
export class BiomassCollectionsModule {}
