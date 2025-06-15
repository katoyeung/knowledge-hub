import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  // @Cron(CronExpression.EVERY_MINUTE)
  // async handleCron() {
  //   this.logger.debug('Running scheduled task');
  //   // Add your cron job logic here
  // }
}
