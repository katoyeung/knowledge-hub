import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { DatasetService } from './dataset.service';

@Controller('datasets')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Post()
  async createDataset(@Body() data: any) {
    return this.datasetService.createDataset(data);
  }

  @Get(':id')
  async getDataset(@Param('id') id: string) {
    return this.datasetService.getDataset(id);
  }

  @Get()
  async listDatasets() {
    return this.datasetService.listDatasets();
  }
} 