import { Injectable, Inject } from '@nestjs/common';
import { StorageDriver } from './interfaces/storage-driver.interface';
import { StorageFile } from './interfaces/storage-file.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject('STORAGE_DRIVER')
    private readonly driver: StorageDriver,
  ) {}

  async put(path: string, file: StorageFile): Promise<string> {
    return this.driver.put(path, file);
  }

  async get(path: string): Promise<Buffer> {
    return this.driver.get(path);
  }

  async delete(path: string): Promise<boolean> {
    return this.driver.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.driver.exists(path);
  }

  async url(path: string): Promise<string> {
    return this.driver.url(path);
  }

  async temporaryUrl(path: string, expiresIn: number = 3600): Promise<string> {
    return this.driver.temporaryUrl(path, expiresIn);
  }
}
