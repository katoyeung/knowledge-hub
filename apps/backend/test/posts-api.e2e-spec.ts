import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { PostsModule } from '../src/modules/posts/posts.module';
import { PostsService } from '../src/modules/posts/posts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Post } from '../src/modules/posts/entities/post.entity';
import { Repository } from 'typeorm';
import { DeduplicationStrategy } from '../src/modules/posts/enums/deduplication-strategy.enum';
import { HashAlgorithm } from '../src/modules/posts/dto/upsert-config.dto';

describe('Posts API (e2e)', () => {
  let app: INestApplication;
  let postsService: PostsService;
  let postRepository: Repository<Post>;

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'POSTS_HASH_CACHE_TTL_DAYS') {
        return defaultValue || '30';
      }
      return defaultValue;
    }),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PostsModule],
    })
      .overrideProvider(getRepositoryToken(Post))
      .useValue(mockRepository)
      .overrideProvider(CACHE_MANAGER)
      .useValue(mockCacheManager)
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    postsService = moduleFixture.get<PostsService>(PostsService);
    postRepository = moduleFixture.get<Repository<Post>>(
      getRepositoryToken(Post),
    );

    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('Cache Integration', () => {
    it('should use cache when fetching post by hash', async () => {
      const hash = 'cached-hash-123';
      const cachedPost = {
        id: 'post-id-1',
        hash,
        title: 'Cached Post',
      };

      mockCacheManager.get.mockResolvedValue(cachedPost);

      const response = await request(app.getHttpServer())
        .get(`/posts/by-hash/${hash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(cachedPost);
      expect(mockCacheManager.get).toHaveBeenCalledWith(`posts:hash:${hash}`);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should query database on cache miss and cache result', async () => {
      const hash = 'uncached-hash-456';
      const dbPost = {
        id: 'post-id-2',
        hash,
        title: 'DB Post',
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockRepository.findOne.mockResolvedValue(dbPost);

      const response = await request(app.getHttpServer())
        .get(`/posts/by-hash/${hash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(dbPost);
      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `posts:hash:${hash}`,
        dbPost,
        expect.any(Number),
      );
    });

    it('should cache post after creation', async () => {
      const createDto = {
        hash: 'new-hash-cache-test',
        title: 'New Post',
        provider: 'google api',
      };

      const savedPost = {
        id: 'post-id-new',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(savedPost);
      mockRepository.save.mockResolvedValue(savedPost);

      const response = await request(app.getHttpServer())
        .post('/posts')
        .send(createDto)
        .expect(201);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `posts:hash:${createDto.hash}`,
        expect.objectContaining({
          hash: createDto.hash,
          title: createDto.title,
        }),
        expect.any(Number),
      );
    });

    it('should update cache after upsert', async () => {
      const postData = {
        hash: 'upsert-cache-hash',
        title: 'Upserted Post',
      };

      const existingPost = {
        id: 'post-id-1',
        hash: 'upsert-cache-hash',
        title: 'Old Title',
      };

      const updatedPost = {
        ...existingPost,
        ...postData,
      };

      mockCacheManager.get.mockResolvedValue(existingPost);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      postsService['findById'] = jest.fn().mockResolvedValue(updatedPost);

      const response = await request(app.getHttpServer())
        .post('/posts/upsert')
        .query({ strategy: 'hash' })
        .send(postData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `posts:hash:${postData.hash}`,
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('POST /posts', () => {
    it('should create a new post', async () => {
      const createDto = {
        hash: 'test-hash-123',
        title: 'Test Post Title',
        provider: 'google api',
        source: 'twitter',
        meta: {
          content: 'Test content here',
          site: 'Metroradio',
          channel: 'News',
        },
      };

      const savedPost = {
        id: 'post-id-1',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(savedPost);
      mockRepository.save.mockResolvedValue(savedPost);

      const response = await request(app.getHttpServer())
        .post('/posts')
        .send(createDto)
        .expect(201);

      expect(response.body).toMatchObject({
        hash: createDto.hash,
        title: createDto.title,
        provider: createDto.provider,
        source: createDto.source,
      });
    });

    it('should reject duplicate hash', async () => {
      const createDto = {
        hash: 'existing-hash',
        title: 'Test Post',
      };

      const existingPost = {
        id: 'existing-id',
        hash: 'existing-hash',
      };

      mockRepository.findOne.mockResolvedValue(existingPost);

      await request(app.getHttpServer())
        .post('/posts')
        .send(createDto)
        .expect(400);
    });
  });

  describe('POST /posts/upsert', () => {
    it('should upsert post by hash', async () => {
      const postData = {
        hash: 'upsert-hash-123',
        title: 'Upserted Post',
        provider: 'lenx api',
        source: 'facebook',
      };

      const existingPost = {
        id: 'post-id-1',
        hash: 'upsert-hash-123',
        title: 'Old Title',
      };

      const updatedPost = {
        ...existingPost,
        ...postData,
      };

      mockRepository.findOne
        .mockResolvedValueOnce(existingPost) // findByHash
        .mockResolvedValueOnce(updatedPost); // findById
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const response = await request(app.getHttpServer())
        .post('/posts/upsert')
        .query({ strategy: 'hash' })
        .send(postData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(postData.title);
    });

    it('should create new post if hash does not exist', async () => {
      const postData = {
        hash: 'new-hash-456',
        title: 'New Post',
      };

      const newPost = {
        id: 'post-id-2',
        ...postData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(newPost);
      mockRepository.save.mockResolvedValue(newPost);

      const response = await request(app.getHttpServer())
        .post('/posts/upsert')
        .send(postData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
    });
  });

  describe('POST /posts/upsert-with-config', () => {
    it('should upsert with field mapping and hash calculation', async () => {
      const sourceData = {
        thread_title: '中銀香港最優惠利率下周一起下調至5厘',
        post_message: '中國銀行(香港)宣佈，自2025年11月3日起...',
        site: 'Metroradio',
        channel: 'Metroradio',
        country: 'Hong Kong',
        post_timestamp: '2025-10-30T05:47:00Z',
        author_name: '新城廣播',
      };

      const config = {
        hashConfig: {
          algorithm: 'sha256',
          fields: ['thread_title', 'post_message', 'post_timestamp'],
        },
        titleMapping: 'thread_title',
        fieldMappings: [
          {
            from: 'post_message',
            to: 'meta.content',
          },
          {
            from: 'site',
            to: 'meta.site',
          },
          {
            from: 'channel',
            to: 'meta.channel',
          },
          {
            from: 'author_name',
            to: 'meta.author_name',
          },
        ],
        defaultMeta: {
          data_source: 'news_api',
        },
      };

      const transformedPost = {
        hash: 'calculated-hash-from-fields',
        title: sourceData.thread_title,
        meta: {
          content: sourceData.post_message,
          site: sourceData.site,
          channel: sourceData.channel,
          author_name: sourceData.author_name,
          data_source: 'news_api',
          country: sourceData.country, // Unmapped fields go to meta
        },
      };

      const savedPost = {
        id: 'post-id-1',
        ...transformedPost,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock the transformSourceData method result
      postsService['transformSourceData'] = jest
        .fn()
        .mockReturnValue(transformedPost);
      postsService['upsert'] = jest.fn().mockResolvedValue(savedPost);

      const response = await request(app.getHttpServer())
        .post('/posts/upsert-with-config')
        .send({
          sourceData,
          config,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(sourceData.thread_title);
      expect(response.body.data.meta.content).toBe(sourceData.post_message);
      expect(response.body.data.meta.site).toBe(sourceData.site);
    });

    it('should handle field transformations', async () => {
      const sourceData = {
        thread_title: '  Test Title with Spaces  ',
        post_message: 'Content here',
      };

      const config = {
        hashConfig: {
          algorithm: 'sha256',
          fields: ['thread_title'],
        },
        titleMapping: 'thread_title',
        fieldMappings: [
          {
            from: 'thread_title',
            to: 'title',
            transform: 'trim',
          },
          {
            from: 'post_message',
            to: 'meta.content',
          },
        ],
      };

      const transformedPost = {
        hash: 'hash',
        title: 'Test Title with Spaces', // Should be trimmed
        meta: {
          content: 'Content here',
        },
      };

      postsService['transformSourceData'] = jest
        .fn()
        .mockReturnValue(transformedPost);
      postsService['upsert'] = jest.fn().mockResolvedValue({
        id: 'post-1',
        ...transformedPost,
      });

      const response = await request(app.getHttpServer())
        .post('/posts/upsert-with-config')
        .send({
          sourceData,
          config,
        })
        .expect(200);

      expect(response.body.data.title).toBe('Test Title with Spaces');
    });
  });

  describe('POST /posts/bulk-upsert-with-config', () => {
    it('should bulk upsert with field mapping', async () => {
      const sourceDataArray = [
        {
          thread_title: 'Post 1',
          post_message: 'Content 1',
          site: 'Site1',
        },
        {
          thread_title: 'Post 2',
          post_message: 'Content 2',
          site: 'Site2',
        },
      ];

      const config = {
        hashConfig: {
          algorithm: 'sha256',
          fields: ['thread_title', 'post_message'],
        },
        titleMapping: 'thread_title',
        fieldMappings: [
          {
            from: 'post_message',
            to: 'meta.content',
          },
          {
            from: 'site',
            to: 'meta.site',
          },
        ],
      };

      postsService['bulkUpsertWithConfig'] = jest.fn().mockResolvedValue({
        created: 2,
        updated: 0,
      });

      const response = await request(app.getHttpServer())
        .post('/posts/bulk-upsert-with-config')
        .send({
          sourceDataArray,
          config,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.created).toBe(2);
      expect(response.body.data.updated).toBe(0);
    });
  });

  describe('GET /posts/search', () => {
    it('should search posts by provider and source', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          hash: 'hash-1',
          provider: 'google api',
          source: 'twitter',
          title: 'Post 1',
        },
        {
          id: 'post-2',
          hash: 'hash-2',
          provider: 'google api',
          source: 'twitter',
          title: 'Post 2',
        },
      ];

      mockQueryBuilder.getCount.mockResolvedValue(2);
      mockQueryBuilder.getMany.mockResolvedValue(mockPosts);

      const response = await request(app.getHttpServer())
        .get('/posts/search')
        .query({
          provider: 'google api',
          source: 'twitter',
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(2);
      expect(response.body.data).toHaveLength(2);
    });

    it('should search by title', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          title: 'Test Title',
        },
      ];

      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue(mockPosts);

      const response = await request(app.getHttpServer())
        .get('/posts/search')
        .query({
          title: 'Test',
        })
        .expect(200);

      expect(response.body.total).toBe(1);
    });

    it('should search by meta fields', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          meta: {
            site: 'Metroradio',
            channel: 'News',
          },
        },
      ];

      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue(mockPosts);

      const response = await request(app.getHttpServer())
        .get('/posts/search')
        .query({
          metaKey: 'site',
          metaValue: JSON.stringify('Metroradio'),
        })
        .expect(200);

      expect(response.body.total).toBe(1);
    });
  });

  describe('GET /posts/by-hash/:hash', () => {
    it('should get post by hash', async () => {
      const hash = 'test-hash-123';
      const mockPost = {
        id: 'post-1',
        hash,
        title: 'Test Post',
      };

      mockRepository.findOne.mockResolvedValue(mockPost);

      const response = await request(app.getHttpServer())
        .get(`/posts/by-hash/${hash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hash).toBe(hash);
    });

    it('should return null when hash not found', async () => {
      const hash = 'non-existent-hash';

      mockRepository.findOne.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get(`/posts/by-hash/${hash}`)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.data).toBeNull();
    });
  });

  describe('GET /posts/by-meta', () => {
    it('should get posts by meta field key', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          meta: { site: 'Metroradio' },
        },
        {
          id: 'post-2',
          meta: { site: 'Metroradio' },
        },
      ];

      mockQueryBuilder.getMany.mockResolvedValue(mockPosts);

      const response = await request(app.getHttpServer())
        .get('/posts/by-meta')
        .query({
          key: 'site',
          value: JSON.stringify('Metroradio'),
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('Deduplication Strategies', () => {
    it('should deduplicate by title and meta.content', async () => {
      const postData = {
        hash: 'hash-1',
        title: 'Test Title',
        meta: {
          content: 'Test content',
        },
      };

      const existingPost = {
        id: 'existing-id',
        title: 'Test Title',
        meta: {
          content: 'Test content',
        },
      };

      mockQueryBuilder.where.mockReturnThis();
      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getOne.mockResolvedValue(existingPost);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue(existingPost);

      const response = await request(app.getHttpServer())
        .post('/posts/upsert')
        .query({ strategy: 'title_content' })
        .send(postData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deduplicate with custom field mappings', async () => {
      const postData = {
        hash: 'hash-1',
        title: 'Test Title',
        meta: {
          site: 'Metroradio',
          channel: 'News',
        },
        deduplicationFields: ['title', 'meta.site', 'meta.channel'],
      };

      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        id: 'new-post',
        ...postData,
      });
      mockRepository.save.mockResolvedValue({
        id: 'new-post',
        ...postData,
      });

      const response = await request(app.getHttpServer())
        .post('/posts/upsert')
        .query({ strategy: 'custom' })
        .send(postData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
