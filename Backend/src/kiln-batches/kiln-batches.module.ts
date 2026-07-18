import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobileNetworkModule } from '../mobile-network/mobile-network.module';
import { KilnBatchesController } from './kiln-batches.controller';
import { KilnBatchesService } from './kiln-batches.service';
import { KilnBatchParserService } from './kiln-batch-parser.service';

@Module({
  imports: [AuthModule, MobileNetworkModule],
  controllers: [KilnBatchesController],
  providers: [KilnBatchesService, KilnBatchParserService],
})
export class KilnBatchesModule {}
