import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { FarmsModule } from './farms/farms.module';
import { KontikkisModule } from './kontikkis/kontikkis.module';
import { BiocharProducersModule } from './biochar-producers/biochar-producers.module';
import { PartnersModule } from './partners/partners.module';
import { FeedstocksModule } from './feedstocks/feedstocks.module';
import { MobileNetworkModule } from './mobile-network/mobile-network.module';
import { PyrolysisSessionsModule } from './pyrolysis-sessions/pyrolysis-sessions.module';
import { PyrolysisBatchesModule } from './pyrolysis-batches/pyrolysis-batches.module';
import { ClimapreneursModule } from './climapreneurs/climapreneurs.module';
import { MixingEntriesModule } from './mixing-entries/mixing-entries.module';
import { ApplicationEntriesModule } from './application-entries/application-entries.module';
import { KilnBatchesModule } from './kiln-batches/kiln-batches.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    HealthModule,
    FarmsModule,
    KontikkisModule,
    BiocharProducersModule,
    PartnersModule,
    FeedstocksModule,
    MobileNetworkModule,
    PyrolysisSessionsModule,
    PyrolysisBatchesModule,
    ClimapreneursModule,
    MixingEntriesModule,
    ApplicationEntriesModule,
    KilnBatchesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
