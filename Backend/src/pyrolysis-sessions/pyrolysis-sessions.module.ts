import { Module } from '@nestjs/common';
import { MobileNetworkModule } from '../mobile-network/mobile-network.module';
import { PyrolysisSessionsController } from './pyrolysis-sessions.controller';
import { PyrolysisSessionsService } from './pyrolysis-sessions.service';

@Module({
  imports: [MobileNetworkModule],
  controllers: [PyrolysisSessionsController],
  providers: [PyrolysisSessionsService],
})
export class PyrolysisSessionsModule {}
