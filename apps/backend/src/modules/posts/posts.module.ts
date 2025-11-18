import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { Post } from './entities/post.entity';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PostsJobsModule } from '@modules/queue/jobs/posts/posts-jobs.module';
import { UserModule } from '@modules/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post]),
    HttpModule,
    ConfigModule,
    CacheModule.register(),
    PostsJobsModule,
    UserModule,
  ],
  providers: [PostsService],
  exports: [PostsService, TypeOrmModule],
  controllers: [PostsController],
})
export class PostsModule {}
