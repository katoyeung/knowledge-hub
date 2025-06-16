import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dataset } from './entities/dataset.entity';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';

@Injectable()
export class DatasetService extends TypeOrmCrudService<Dataset> {
  constructor(
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    super(datasetRepository);
  }

  async findById(id: string): Promise<Dataset | null> {
    return this.datasetRepository.findOne({
      where: { id },
      relations: ['owner', 'documents', 'segments', 'keywordTable'],
    });
  }

  async create(data: CreateDatasetDto): Promise<Dataset> {
    const dataset = this.datasetRepository.create(data);
    return this.datasetRepository.save(dataset);
  }

  async update(id: string, data: UpdateDatasetDto): Promise<Dataset> {
    await this.datasetRepository.update(id, data);
    const dataset = await this.findById(id);
    if (!dataset) {
      throw new Error('Dataset not found');
    }
    await this.invalidateDatasetCache(id);
    return dataset;
  }

  async invalidateDatasetCache(datasetId: string): Promise<void> {
    await this.cacheManager.del(`dataset:${datasetId}`);
    await this.cacheManager.del('datasets:all');
  }

  async updateDataset(id: string, data: UpdateDatasetDto): Promise<Dataset> {
    const dataset = await this.datasetRepository.save({ id, ...data });
    await this.invalidateDatasetCache(id);
    return dataset;
  }

  async deleteDataset(id: string): Promise<void> {
    await this.datasetRepository.delete(id);
    await this.invalidateDatasetCache(id);
  }

  async getDatasetWithDetails(id: string): Promise<Dataset | null> {
    return this.datasetRepository.findOne({
      where: { id },
      relations: [
        'owner',
        'documents',
        'documents.segments',
        'segments',
        'keywordTable',
      ],
    });
  }

  async getDatasetsByUser(userId: string): Promise<Dataset[]> {
    return this.datasetRepository.find({
      where: { userId },
      relations: ['owner', 'documents'],
      order: { createdAt: 'DESC' },
    });
  }
}
