import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentProcessingModule } from './document/document-processing.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'default',
    }),
    DocumentProcessingModule,
  ],
  providers: [],
  exports: [DocumentProcessingModule],
})
export class JobsModule {}
