import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FieldActivityController } from './field-activity.controller';
import { FieldActivityService } from './field-activity.service';

@Module({
  imports: [AuthModule],
  controllers: [FieldActivityController],
  providers: [FieldActivityService],
})
export class FieldActivityModule {}
