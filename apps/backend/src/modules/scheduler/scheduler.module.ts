// src/modules/scheduler/scheduler.module.ts
import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([])],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
