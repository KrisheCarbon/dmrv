import { Module } from '@nestjs/common';
import { PyrolysisBatchesController } from './pyrolysis-batches.controller';
import { PyrolysisBatchesService } from './pyrolysis-batches.service';

@Module({
  controllers: [PyrolysisBatchesController],
  providers: [PyrolysisBatchesService],
})
export class PyrolysisBatchesModule {}
