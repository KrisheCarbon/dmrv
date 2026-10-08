import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VerificationReportsModule } from '../verification-reports/verification-reports.module';
import { FeedstocksController } from './feedstocks.controller';
import { FeedstocksService } from './feedstocks.service';

@Module({
  imports: [AuthModule, VerificationReportsModule],
  controllers: [FeedstocksController],
  providers: [FeedstocksService],
})
export class FeedstocksModule {}
