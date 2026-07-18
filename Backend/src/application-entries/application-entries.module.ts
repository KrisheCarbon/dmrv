import { Module } from '@nestjs/common';
import { MobileNetworkModule } from '../mobile-network/mobile-network.module';
import { ApplicationEntriesController } from './application-entries.controller';
import { ApplicationEntriesService } from './application-entries.service';

@Module({
  imports: [MobileNetworkModule],
  controllers: [ApplicationEntriesController],
  providers: [ApplicationEntriesService],
})
export class ApplicationEntriesModule {}
