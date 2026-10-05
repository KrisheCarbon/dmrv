import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapStatsController } from './map-stats.controller';
import { MapStatsService } from './map-stats.service';

@Module({
  imports: [AuthModule],
  controllers: [MapStatsController],
  providers: [MapStatsService],
})
export class MapStatsModule {}
