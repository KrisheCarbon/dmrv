import { Module } from '@nestjs/common';
import { ClockController } from './clock.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, ClockController],
})
export class HealthModule {}
