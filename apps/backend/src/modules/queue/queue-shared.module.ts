import { Module, Global } from '@nestjs/common';
import { JobRegistryService } from './services/job-registry.service';

@Global()
@Module({
  providers: [JobRegistryService],
  exports: [JobRegistryService],
})
export class QueueSharedModule {}
