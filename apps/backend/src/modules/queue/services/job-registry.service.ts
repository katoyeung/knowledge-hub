import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

@Injectable()
export class JobRegistryService {
  private readonly logger = new Logger(JobRegistryService.name);
  private readonly jobs: Map<string, any> = new Map();

  register(job: any): void {
    const jobName = job.jobType || job.name;
    this.jobs.set(jobName, job);
    this.logger.debug(`Registered job: ${jobName}`);
  }

  getJob(name: string): any {
    return this.jobs.get(name);
  }

  getAllJobs(): any[] {
    return Array.from(this.jobs.values());
  }

  logRegisteredJobs(): void {
    this.logger.debug('Registered jobs:', Array.from(this.jobs.keys()));
  }
}
