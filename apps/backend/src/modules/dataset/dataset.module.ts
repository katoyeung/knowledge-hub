import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dataset } from './entities/dataset.entity';
import { Document } from './entities/document.entity';
import { DocumentSegment } from './entities/document-segment.entity';
import { DatasetKeywordTable } from './entities/dataset-keyword-table.entity';
import { Embedding } from './entities/embedding.entity';
import { DatasetService } from './dataset.service';
import { DatasetController } from './dataset.controller';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dataset,
      Document,
      DocumentSegment,
      DatasetKeywordTable,
      Embedding,
    ]),
  ],
  providers: [DatasetService, DocumentService],
  exports: [TypeOrmModule, DatasetService, DocumentService],
  controllers: [DatasetController, DocumentController],
})
export class DatasetModule {}
