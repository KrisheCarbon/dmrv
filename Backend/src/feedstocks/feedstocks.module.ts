import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeedstocksController } from './feedstocks.controller';
import { FeedstocksService } from './feedstocks.service';

@Module({
  imports: [AuthModule],
  controllers: [FeedstocksController],
  providers: [FeedstocksService],
})
export class FeedstocksModule {}
