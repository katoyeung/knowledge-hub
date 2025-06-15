import { StorageFile } from './storage-file.interface';

export interface StorageDriver {
  put(path: string, file: StorageFile): Promise<string>;
  get(path: string): Promise<Buffer>;
  delete(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  url(path: string): Promise<string>;
  temporaryUrl(path: string, expiresIn: number): Promise<string>;
}
