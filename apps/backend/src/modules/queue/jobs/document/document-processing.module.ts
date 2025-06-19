import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentParserProcessor } from './document-parser.processor';
import { Document } from '../../../dataset/entities/document.entity';
import { DocumentSegment } from '../../../dataset/entities/document-segment.entity';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'document-processing',
    }),
    TypeOrmModule.forFeature([Document, DocumentSegment]),
  ],
  providers: [DocumentParserProcessor],
  exports: [BullModule],
})
export class DocumentProcessingModule {}
