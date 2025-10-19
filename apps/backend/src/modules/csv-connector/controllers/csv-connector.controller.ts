import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvConnectorTemplateService } from '../services/csv-connector-template.service';
import { CsvParserService } from '../services/csv-parser.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('csv-connector')
@UseGuards(JwtAuthGuard)
export class CsvConnectorController {
  constructor(
    private readonly templateService: CsvConnectorTemplateService,
    private readonly parserService: CsvParserService,
  ) {}

  @Get('templates')
  async getTemplates() {
    return this.templateService.getAvailableTemplates();
  }

  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  async validateCsvHeaders(
    @UploadedFile() file: Express.Multer.File,
    @Body('templateName') templateName: string,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!templateName) {
      throw new Error('Template name is required');
    }

    const filePath = file.path;
    const validation = await this.parserService.validateCsvForTemplate(
      filePath,
      templateName,
    );

    return {
      isValid: validation.isValid,
      missingColumns: validation.validation.missingColumns,
      extraColumns: validation.validation.extraColumns,
    };
  }
}
