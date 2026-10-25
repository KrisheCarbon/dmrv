import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PostgresJsonInterceptor } from './postgres-json.interceptor';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
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
import { BiomassCollectionsModule } from './biomass-collections/biomass-collections.module';
import { KilnBatchesModule } from './kiln-batches/kiln-batches.module';
import { TrainingsModule } from './trainings/trainings.module';
import { FarmersNetworkModule } from './farmers-network/farmers-network.module';
import { ClustersModule } from './clusters/clusters.module';
import { VerificationReportsModule } from './verification-reports/verification-reports.module';
import { MapStatsModule } from './map-stats/map-stats.module';
import { FieldActivityModule } from './field-activity/field-activity.module';
import { PaymentsModule } from './payments/payments.module';
import { FieldOperationsModule } from './field-operations/field-operations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
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
    BiomassCollectionsModule,
    KilnBatchesModule,
    TrainingsModule,
    FarmersNetworkModule,
    ClustersModule,
    VerificationReportsModule,
    MapStatsModule,
    FieldActivityModule,
    PaymentsModule,
    FieldOperationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: PostgresJsonInterceptor }],
})
export class AppModule {}
