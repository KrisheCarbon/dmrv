import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObjectStorageModule } from '../object-storage/object-storage.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, ObjectStorageModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
