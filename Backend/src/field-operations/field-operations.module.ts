import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObjectStorageModule } from '../object-storage/object-storage.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { TrainingSessionsController } from './training-sessions.controller';
import { TrainingSessionsService } from './training-sessions.service';

@Module({
  imports: [AuthModule, ObjectStorageModule],
  controllers: [TrainingSessionsController, InspectionsController],
  providers: [TrainingSessionsService, InspectionsService],
})
export class FieldOperationsModule {}
