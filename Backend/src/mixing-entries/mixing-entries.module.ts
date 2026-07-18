import { Module } from '@nestjs/common';
import { MobileNetworkModule } from '../mobile-network/mobile-network.module';
import { MixingEntriesController } from './mixing-entries.controller';
import { MixingEntriesService } from './mixing-entries.service';

@Module({
  imports: [MobileNetworkModule],
  controllers: [MixingEntriesController],
  providers: [MixingEntriesService],
})
export class MixingEntriesModule {}
