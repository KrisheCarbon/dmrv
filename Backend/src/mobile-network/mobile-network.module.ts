import { Module } from '@nestjs/common';
import { MobileNetworkController } from './mobile-network.controller';
import { MobileNetworkService } from './mobile-network.service';

@Module({
  controllers: [MobileNetworkController],
  providers: [MobileNetworkService],
  exports: [MobileNetworkService],
})
export class MobileNetworkModule {}
