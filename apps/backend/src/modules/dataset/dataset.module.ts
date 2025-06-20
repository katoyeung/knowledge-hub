import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventModule } from '../event/event.module';
import { Dataset } from './entities/dataset.entity';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { DatasetKeywordTable } from './entities/dataset-keyword-table.entity';
import { Embedding } from './entities/embedding.entity';
import { DatasetService } from './dataset.service';
import { DatasetController } from './dataset.controller';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { DocumentSegmentService } from './document-segment.service';
import { DocumentSegmentController } from './document-segment.controller';
import { DocumentProcessingService } from './services/document-processing.service';
import { EmbeddingService } from './services/embedding.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dataset,
      Document,
      DocumentSegment,
      DatasetKeywordTable,
      Embedding,
    ]),
    EventModule,
  ],
  providers: [
    DatasetService,
    DocumentService,
    DocumentSegmentService,
    DocumentProcessingService,
    EmbeddingService,
  ],
  exports: [
    TypeOrmModule,
    DatasetService,
    DocumentService,
    DocumentSegmentService,
    DocumentProcessingService,
    EmbeddingService,
  ],
  controllers: [
    DatasetController,
    DocumentController,
    DocumentSegmentController,
  ],
})
export class DatasetModule {}
