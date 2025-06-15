import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { StorageFile } from './interfaces/storage-file.interface';

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly storageDriver: LocalStorageDriver,
  ) {}

  @Post(':path(*)')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('path') path: string,
    @UploadedFile() file: StorageFile,
  ) {
    const filePath = await this.storageService.put(path, file);
    return {
      path: filePath,
      url: await this.storageService.url(filePath),
    };
  }

  @Get(':path(*)')
  async getFile(
    @Param('path') path: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // If token is provided, validate it
    if (token && !this.storageDriver.validateTemporaryUrl(token)) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const file = await this.storageService.get(path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(file);
  }

  @Delete(':path(*)')
  async deleteFile(@Param('path') path: string) {
    const deleted = await this.storageService.delete(path);
    return { success: deleted };
  }

  @Get(':path(*)/url')
  async getFileUrl(@Param('path') path: string) {
    return {
      url: await this.storageService.url(path),
    };
  }

  @Get(':path(*)/temporary-url')
  async getTemporaryUrl(
    @Param('path') path: string,
    @Query('expires') expires: string,
  ) {
    const expiresIn = expires ? parseInt(expires, 10) : 3600;
    return {
      url: await this.storageService.temporaryUrl(path, expiresIn),
    };
  }
}
