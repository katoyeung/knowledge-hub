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
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventModule } from '@modules/event/event.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';
import { DocumentParserModule } from '@modules/document-parser/document-parser.module';
import { ChatModule } from '@modules/chat/chat.module';

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
    ChatModule,
    NotificationModule,
    QueueModule,
    EventEmitterModule.forRoot(),
    EventModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
