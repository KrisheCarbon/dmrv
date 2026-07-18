import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KontikkisController } from './kontikkis.controller';
import { KontikkisService } from './kontikkis.service';

@Module({
  imports: [AuthModule],
  controllers: [KontikkisController],
  providers: [KontikkisService],
})
export class KontikkisModule {}
