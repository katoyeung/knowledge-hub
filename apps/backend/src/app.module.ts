import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from '@modules/user';
import { AuthModule } from '@modules/auth';
import { getDatabaseConfig, localModelsConfig } from './config';
import { AccessModule } from '@modules/access';
import { DatasetModule } from '@modules/dataset';
import { AiProviderModule } from '@modules/ai-provider';
import { PromptsModule } from '@modules/prompts';
import { CacheModule } from '@nestjs/cache-manager';
import { getCacheConfig } from './config/cache.config';
import { NotificationModule } from '@modules/notification/notification.module';
import { QueueModule } from '@modules/queue/queue.module';
import { QueueCoreModule } from '@modules/queue/queue-core.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventModule } from '@modules/event/event.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';
import { DocumentParserModule } from '@modules/document-parser/document-parser.module';
import { CsvConnectorModule } from '@modules/csv-connector/csv-connector.module';
import { ChatModule } from '@modules/chat/chat.module';
import { GraphModule } from '@modules/graph/graph.module';
import { PipelineModule } from '@modules/pipeline/pipeline.module';
import { WorkflowModule } from '@modules/pipeline/workflow.module';
import { Document } from './modules/dataset/entities/document.entity';
import { DocumentSegment } from './modules/dataset/entities/document-segment.entity';
import { QueueSharedModule } from './modules/queue/queue-shared.module';
import { DocumentJobsModule } from './modules/queue/jobs/document/document-jobs.module';
import { GraphJobsModule } from './modules/queue/jobs/graph/graph-jobs.module';
import { JobsModule } from './modules/queue/jobs/jobs.module';
import { CPUThrottlingService } from './common/services/cpu-throttling.service';
import { CPUThrottlingInterceptor } from './common/interceptors/cpu-throttling.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [localModelsConfig],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getCacheConfig,
    }),
    UserModule,
    AuthModule,
    AccessModule,
    DatasetModule,
    AiProviderModule,
    PromptsModule,
    DocumentParserModule,
    CsvConnectorModule,
    ChatModule,
    GraphModule,
    PipelineModule,
    WorkflowModule,
    NotificationModule,
    QueueSharedModule,
    QueueModule,
    QueueCoreModule,
    DocumentJobsModule,
    GraphJobsModule,
    JobsModule,
    EventEmitterModule.forRoot(),
    EventModule,
    SchedulerModule,
    TypeOrmModule.forFeature([Document, DocumentSegment]),
  ],
  controllers: [AppController],
  providers: [AppService, CPUThrottlingService, CPUThrottlingInterceptor],
})
export class AppModule {}
