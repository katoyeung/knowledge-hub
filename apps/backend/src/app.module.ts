import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from '@modules/user';
import { AuthModule } from '@modules/auth';
import { getDatabaseConfig } from './config';
import { AccessModule } from '@modules/access';
import { CacheModule } from '@nestjs/cache-manager';
import { getCacheConfig } from './config/cache.config';
import { NotificationModule } from '@modules/notification/notification.module';
import { QueueModule } from '@modules/queue/queue.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventModule } from '@modules/event/event.module';
import { SchedulerModule } from '@modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
