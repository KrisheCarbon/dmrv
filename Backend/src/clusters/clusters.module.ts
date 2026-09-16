import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClustersController } from './clusters.controller';
import { ClustersService } from './clusters.service';

@Module({
  imports: [AuthModule],
  controllers: [ClustersController],
  providers: [ClustersService],
})
export class ClustersModule {}
