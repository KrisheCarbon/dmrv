import { Module } from '@nestjs/common';
import { MobileNetworkModule } from '../mobile-network/mobile-network.module';
import { BiomassCollectionsController } from './biomass-collections.controller';
import { BiomassCollectionsService } from './biomass-collections.service';

@Module({
  imports: [MobileNetworkModule],
  controllers: [BiomassCollectionsController],
  providers: [BiomassCollectionsService],
})
export class BiomassCollectionsModule {}
