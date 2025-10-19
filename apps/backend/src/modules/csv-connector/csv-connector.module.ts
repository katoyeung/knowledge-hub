import { Module } from '@nestjs/common';
import { CsvConnectorTemplateService } from './services/csv-connector-template.service';
import { CsvParserService } from './services/csv-parser.service';
import { CsvConnectorController } from './controllers/csv-connector.controller';
import { DetectorService } from '../../common/services/detector.service';

@Module({
  controllers: [CsvConnectorController],
  providers: [CsvConnectorTemplateService, CsvParserService, DetectorService],
  exports: [CsvConnectorTemplateService, CsvParserService],
})
export class CsvConnectorModule {}
