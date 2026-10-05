import { Module } from '@nestjs/common';
import { VerificationReportsController } from './verification-reports.controller';
import { VerificationReportsService } from './verification-reports.service';

@Module({
  controllers: [VerificationReportsController],
  providers: [VerificationReportsService],
})
export class VerificationReportsModule {}
