import { Module } from '@nestjs/common';
import { VerificationReportsController } from './verification-reports.controller';
import { RainbowRecordsService } from './rainbow-records.service';
import { VerificationReportsService } from './verification-reports.service';

@Module({
  controllers: [VerificationReportsController],
  providers: [VerificationReportsService, RainbowRecordsService],
})
export class VerificationReportsModule {}
