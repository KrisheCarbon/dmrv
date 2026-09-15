import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  FarmFieldsController,
  FarmerConsentsController,
  SoilTestsController,
} from './farmers-network.controller';
import { FarmersNetworkService } from './farmers-network.service';

@Module({
  imports: [AuthModule],
  controllers: [
    FarmFieldsController,
    FarmerConsentsController,
    SoilTestsController,
  ],
  providers: [FarmersNetworkService],
})
export class FarmersNetworkModule {}
