import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { PostsService } from './posts.service';
import { Post } from './entities/post.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { BulkCreatePostsDto } from './dto/bulk-create-posts.dto';
import { DeduplicationStrategy } from './enums/deduplication-strategy.enum';
import {
  UpsertConfigDto,
  HashConfigDto,
  FieldMappingDto,
  HashAlgorithm,
} from './dto/upsert-config.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PostsService', () => {
  let service: PostsService;
  let repository: Repository<Post>;
  let cacheManager: Cache;
  let configService: ConfigService;

  // Create a more complete mock repository that satisfies TypeOrmCrudService requirements
  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      connection: {
        driver: {},
        options: {},
      },
      getRepository: jest.fn().mockReturnThis(),
    },
    connection: {
      manager: {
        connection: {
          driver: {},
        },
      },
    },
  } as any;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        {
          provide: getRepositoryToken(Post),
          useValue: mockRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    repository = module.get<Repository<Post>>(getRepositoryToken(Post));
    cacheManager = module.get<Cache>(CACHE_MANAGER);
    configService = module.get<ConfigService>(ConfigService);

    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new post successfully', async () => {
      const createDto: CreatePostDto = {
        hash: 'test-hash-123',
        title: 'Test Post',
        provider: 'google api',
        source: 'twitter',
        meta: { content: 'Test content' },
      };

      const savedPost = {
        id: 'post-id-1',
        ...createDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock findByHash method
      jest.spyOn(service, 'findByHash' as any).mockResolvedValue(null);
      mockRepository.create.mockReturnValue(savedPost);
      mockRepository.save.mockResolvedValue(savedPost);

      const result = await service.create(createDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if hash already exists', async () => {
      const createDto: CreatePostDto = {
        hash: 'existing-hash',
        title: 'Test Post',
      };

      const existingPost = { id: 'existing-id', hash: 'existing-hash' };
      mockRepository.findOne.mockResolvedValue(existingPost);

      // Mock findByHash
      jest.spyOn(service, 'findByHash' as any).mockResolvedValue(existingPost);

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByHash', () => {
    it('should return post when hash exists', async () => {
      const hash = 'test-hash-123';
      const mockPost = {
        id: 'post-id-1',
        hash,
        title: 'Test Post',
      };

      mockRepository.findOne.mockResolvedValue(mockPost);

      const result = await service.findByHash(hash);

      expect(result).toEqual(mockPost);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { hash },
      });
    });

    it('should return null when hash does not exist', async () => {
      const hash = 'non-existent-hash';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByHash(hash);

      expect(result).toBeNull();
    });
  });

  describe('upsertByHash', () => {
    it('should update existing post when hash exists', async () => {
      const postData: CreatePostDto = {
        hash: 'existing-hash',
        title: 'Updated Title',
        meta: { content: 'Updated content' },
      };

      const existingPost = {
        id: 'post-id-1',
        hash: 'existing-hash',
        title: 'Old Title',
      };

      const updatedPost = {
        ...existingPost,
        ...postData,
      };

      jest.spyOn(service, 'findByHash' as any).mockResolvedValue(existingPost);
      jest.spyOn(service, 'findById' as any).mockResolvedValue(updatedPost);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.upsertByHash(postData);

      expect(mockRepository.update).toHaveBeenCalledWith(
        existingPost.id,
        postData,
      );
      expect(result).toEqual(updatedPost);
    });

    it('should create new post when hash does not exist', async () => {
      const postData: CreatePostDto = {
        hash: 'new-hash',
        title: 'New Post',
      };

      const newPost = {
        id: 'post-id-2',
        ...postData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(service, 'findByHash' as any).mockResolvedValue(null);
      mockRepository.create.mockReturnValue(newPost);
      mockRepository.save.mockResolvedValue(newPost);

      const result = await service.upsertByHash(postData);

      expect(mockRepository.create).toHaveBeenCalledWith(postData);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(newPost);
    });

    it('should throw BadRequestException when hash is missing', async () => {
      const postData: CreatePostDto = {
        hash: '',
        title: 'Test',
      } as any;

      await expect(service.upsertByHash(postData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('upsertWithConfig', () => {
    it('should transform source data and upsert successfully', async () => {
      const sourceData = {
        thread_title: 'Test Title',
        post_message: 'Test content',
        site: 'Metroradio',
        channel: 'News',
        post_timestamp: '2025-10-30T05:47:00Z',
      };

      const config: UpsertConfigDto = {
        hashConfig: {
          algorithm: HashAlgorithm.SHA256,
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
        ],
      };

      const transformedPost = {
        hash: 'calculated-hash',
        title: 'Test Title',
        meta: {
          content: 'Test content',
          site: 'Metroradio',
          channel: 'News',
        },
      };

      jest
        .spyOn(service as any, 'transformSourceData')
        .mockReturnValue(transformedPost);
      jest.spyOn(service, 'upsert' as any).mockResolvedValue({
        id: 'post-id',
        ...transformedPost,
      });

      const result = await service.upsertWithConfig(
        sourceData,
        config,
        DeduplicationStrategy.HASH,
      );

      expect(service['transformSourceData']).toHaveBeenCalledWith(
        sourceData,
        config,
      );
      expect(service['upsert']).toHaveBeenCalledWith(
        transformedPost,
        DeduplicationStrategy.HASH,
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('should calculate hash correctly from multiple fields', async () => {
      const sourceData = {
        thread_title: 'Test Title',
        post_message: 'Test content',
        post_timestamp: '2025-10-30T05:47:00Z',
      };

      const hashConfig: HashConfigDto = {
        algorithm: HashAlgorithm.SHA256,
        fields: ['thread_title', 'post_message', 'post_timestamp'],
        separator: '|',
      };

      const result = (service as any).calculateHash(sourceData, hashConfig);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0); // SHA256 produces 64 char hex string
    });

    it('should map fields correctly with transformations', async () => {
      const sourceData = {
        thread_title: '  Test Title  ',
        post_message: 'Test content',
        author_name: '  JOHN DOE  ',
      };

      const config: UpsertConfigDto = {
        hashConfig: {
          algorithm: HashAlgorithm.SHA256,
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
          {
            from: 'author_name',
            to: 'meta.author_name',
            transform: 'trim_lowercase',
          },
        ],
      };

      const result = (service as any).transformSourceData(sourceData, config);

      expect(result.hash).toBeDefined();
      expect(result.title).toBe('Test Title'); // Should be trimmed
      expect(result.meta.content).toBe('Test content');
      expect(result.meta.author_name).toBe('john doe'); // Trimmed and lowercased
    });
  });

  describe('bulkUpsert', () => {
    it('should bulk upsert multiple posts', async () => {
      const bulkData: BulkCreatePostsDto = {
        posts: [
          {
            hash: 'hash-1',
            title: 'Post 1',
            provider: 'google api',
            source: 'twitter',
          },
          {
            hash: 'hash-2',
            title: 'Post 2',
            provider: 'lenx api',
            source: 'facebook',
          },
        ],
      };

      jest.spyOn(service as any, 'findDuplicate').mockResolvedValue(null);
      mockRepository.create.mockImplementation((dto: any) => ({
        id: `post-${dto.hash}`,
        ...dto,
      }));
      mockRepository.save.mockResolvedValue({});

      const result = await service.bulkUpsert(
        bulkData,
        DeduplicationStrategy.HASH,
      );

      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
    });

    it('should update existing posts in bulk upsert', async () => {
      const bulkData: BulkCreatePostsDto = {
        posts: [
          {
            hash: 'existing-hash-1',
            title: 'Updated Post 1',
          },
          {
            hash: 'new-hash-2',
            title: 'New Post 2',
          },
        ],
      };

      const existingPost = {
        id: 'post-id-1',
        hash: 'existing-hash-1',
      };

      jest
        .spyOn(service as any, 'findDuplicate')
        .mockResolvedValueOnce(existingPost)
        .mockResolvedValueOnce(null);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      jest.spyOn(service, 'findById' as any).mockResolvedValue({
        ...existingPost,
        title: 'Updated Post 1',
      });
      mockRepository.create.mockReturnValue({
        id: 'post-id-2',
        hash: 'new-hash-2',
      });
      mockRepository.save.mockResolvedValue({});

      const result = await service.bulkUpsert(
        bulkData,
        DeduplicationStrategy.HASH,
      );

      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
    });
  });

  describe('search', () => {
    it('should search posts with filters', async () => {
      const filters = {
        provider: 'google api',
        source: 'twitter',
        title: 'test',
        page: 1,
        limit: 10,
      };

      const mockPosts = [
        {
          id: 'post-1',
          hash: 'hash-1',
          provider: 'google api',
          source: 'twitter',
          title: 'Test Post 1',
        },
        {
          id: 'post-2',
          hash: 'hash-2',
          provider: 'google api',
          source: 'twitter',
          title: 'Test Post 2',
        },
      ];

      mockQueryBuilder.getCount.mockResolvedValue(2);
      mockQueryBuilder.getMany.mockResolvedValue(mockPosts);

      const result = await service.search(filters);

      expect(result.total).toBe(2);
      expect(result.data).toEqual(mockPosts);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should search by meta fields', async () => {
      const filters = {
        metaKey: 'site',
        metaValue: 'Metroradio',
        page: 1,
        limit: 10,
      };

      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getCount.mockResolvedValue(1);
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'post-1',
          meta: { site: 'Metroradio' },
        },
      ]);

      const result = await service.search(filters);

      expect(result.total).toBe(1);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('findDuplicate', () => {
    it('should find duplicate by hash', async () => {
      const postData: CreatePostDto = {
        hash: 'existing-hash',
        title: 'Test',
      };

      const existingPost = {
        id: 'post-id',
        hash: 'existing-hash',
      };

      jest.spyOn(service, 'findByHash' as any).mockResolvedValue(existingPost);

      const result = await (service as any).findDuplicate(
        postData,
        DeduplicationStrategy.HASH,
      );

      expect(result).toEqual(existingPost);
    });

    it('should find duplicate by title and meta.content', async () => {
      const postData: CreatePostDto = {
        hash: 'new-hash',
        title: 'Test Title',
        meta: {
          content: 'Test content',
        },
      };

      const existingPost = {
        id: 'post-id',
        hash: 'different-hash',
        title: 'Test Title',
        meta: {
          content: 'Test content',
        },
      };

      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getOne.mockResolvedValue(existingPost);

      const result = await service['findDuplicate'](
        postData,
        DeduplicationStrategy.TITLE_CONTENT,
      );

      expect(result).toEqual(existingPost);
      expect(mockQueryBuilder.where).toHaveBeenCalled();
    });

    it('should find duplicate with custom field mapping', async () => {
      const postData: CreatePostDto = {
        hash: 'hash-1',
        title: 'Test Title',
        meta: {
          site: 'Metroradio',
          channel: 'News',
        },
      };

      const fieldMappings = ['title', 'meta.site', 'meta.channel'];

      mockQueryBuilder.andWhere.mockReturnThis();
      mockQueryBuilder.getOne.mockResolvedValue({
        id: 'existing-post',
        ...postData,
      });

      const result = await (service as any).findDuplicateByFieldMapping(
        postData,
        fieldMappings,
      );

      expect(result).toBeDefined();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete post successfully', async () => {
      const postId = 'post-id-1';

      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.delete(postId);

      expect(mockRepository.delete).toHaveBeenCalledWith(postId);
    });

    it('should throw NotFoundException when post does not exist', async () => {
      const postId = 'non-existent-id';

      mockRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete(postId)).rejects.toThrow(NotFoundException);
    });
  });
});
