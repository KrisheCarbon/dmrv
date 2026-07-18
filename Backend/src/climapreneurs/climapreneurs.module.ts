import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClimapreneursController } from './climapreneurs.controller';
import { ClimapreneursService } from './climapreneurs.service';

@Module({
  imports: [AuthModule],
  controllers: [ClimapreneursController],
  providers: [ClimapreneursService],
})
export class ClimapreneursModule {}
