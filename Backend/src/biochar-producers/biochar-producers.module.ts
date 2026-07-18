import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BiocharProducersController } from './biochar-producers.controller';
import { BiocharProducersService } from './biochar-producers.service';

@Module({
  imports: [AuthModule],
  controllers: [BiocharProducersController],
  providers: [BiocharProducersService],
})
export class BiocharProducersModule {}
