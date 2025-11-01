import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { Post } from './entities/post.entity';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post]),
    HttpModule,
    ConfigModule,
    CacheModule.register(),
  ],
  providers: [PostsService],
  exports: [PostsService, TypeOrmModule],
  controllers: [PostsController],
})
export class PostsModule {}
