import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageDriver } from '../interfaces/storage-driver.interface';
import { StorageFile } from '../interfaces/storage-file.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly basePath: string;
  private readonly baseUrl: string;
  private readonly tempUrls: Map<string, { expiresAt: number }> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.basePath = this.configService.get('STORAGE_LOCAL_PATH', 'storage');
    this.baseUrl = this.configService.get('STORAGE_LOCAL_URL', '/storage');
  }

  async put(filePath: string, file: StorageFile): Promise<string> {
    const fullPath = path.join(this.basePath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer);
    return filePath;
  }

  async get(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.readFile(fullPath);
  }

  async delete(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, filePath);
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async url(filePath: string): Promise<string> {
    return `${this.baseUrl}/${filePath}`;
  }

  async temporaryUrl(
    filePath: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + expiresIn * 1000;

    this.tempUrls.set(token, { expiresAt });

    // Clean up expired tokens
    this.cleanupExpiredTokens();

    return `${this.baseUrl}/${filePath}?token=${token}`;
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    for (const [token, { expiresAt }] of this.tempUrls.entries()) {
      if (expiresAt < now) {
        this.tempUrls.delete(token);
      }
    }
  }

  validateTemporaryUrl(token: string): boolean {
    const urlData = this.tempUrls.get(token);
    if (!urlData) return false;

    if (urlData.expiresAt < Date.now()) {
      this.tempUrls.delete(token);
      return false;
    }

    return true;
  }
}
