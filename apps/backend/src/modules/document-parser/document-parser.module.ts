import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RagflowPdfParserService } from './services/ragflow-pdf-parser.service';
import { SimplePdfParserService } from './services/simple-pdf-parser.service';
import { DocumentParserController } from './controllers/document-parser.controller';
import { Document } from '../dataset/entities/document.entity';
import { DocumentSegment } from '../dataset/entities/document-segment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Document, DocumentSegment])],
  controllers: [DocumentParserController],
  providers: [RagflowPdfParserService, SimplePdfParserService],
  exports: [RagflowPdfParserService, SimplePdfParserService],
})
export class DocumentParserModule {}
