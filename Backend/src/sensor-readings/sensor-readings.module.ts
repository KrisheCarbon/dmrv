import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SensorReadingsController } from './sensor-readings.controller';
import { SensorReadingsService } from './sensor-readings.service';

@Module({
  imports: [AuthModule],
  controllers: [SensorReadingsController],
  providers: [SensorReadingsService],
})
export class SensorReadingsModule {}
