import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { LocalStorageDriver } from './drivers/local-storage.driver';

@Module({
  imports: [ConfigModule],
  providers: [
    StorageService,
    {
      provide: 'STORAGE_DRIVER',
      useClass: LocalStorageDriver,
    },
  ],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
