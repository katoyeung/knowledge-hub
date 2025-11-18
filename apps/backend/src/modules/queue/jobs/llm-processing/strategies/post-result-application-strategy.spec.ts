import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostResultApplicationStrategy } from './post-result-application-strategy';
import { FieldMappingService } from '../services/field-mapping.service';
import { Post } from '../../../../posts/entities/post.entity';
import { PostStatus } from '../../../../posts/enums/post-status.enum';
import {
  FieldMappingConfig,
  ProcessingMetadata,
} from '../interfaces/result-application-strategy.interface';

describe('PostResultApplicationStrategy', () => {
  let strategy: PostResultApplicationStrategy;
  let postRepository: Repository<Post>;
  let fieldMappingService: FieldMappingService;

  const mockPostRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockFieldMappingService = {
    applyMappings: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostResultApplicationStrategy,
        {
          provide: getRepositoryToken(Post),
          useValue: mockPostRepository,
        },
        {
          provide: FieldMappingService,
          useValue: mockFieldMappingService,
        },
      ],
    }).compile();

    strategy = module.get<PostResultApplicationStrategy>(
      PostResultApplicationStrategy,
    );
    postRepository = module.get<Repository<Post>>(getRepositoryToken(Post));
    fieldMappingService = module.get<FieldMappingService>(FieldMappingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should return correct entity type', () => {
    expect(strategy.getEntityType()).toBe('post');
  });

  describe('applyResult', () => {
    it('should apply result to post successfully', async () => {
      const postId = 'post-1';
      const result = {
        status: 'approved',
        reason: 'Content is appropriate',
        confidenceScore: 0.95,
      };

      const fieldMappings: FieldMappingConfig = {
        mappings: {
          status: {
            from: 'status',
            transform: (v) =>
              v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
          },
          approvalReason: 'reason',
          confidenceScore: 'confidenceScore',
        },
      };

      const metadata: ProcessingMetadata = {
        userId: 'user-1',
        timestamp: new Date(),
      };

      const mockPost = {
        id: postId,
        title: 'Test Post',
      };

      const mockUpdateData = {
        status: PostStatus.APPROVED,
        approvalReason: 'Content is appropriate',
        confidenceScore: 0.95,
      };

      mockPostRepository.findOne.mockResolvedValue(mockPost);
      mockPostRepository.update.mockResolvedValue({ affected: 1 });
      mockFieldMappingService.applyMappings.mockReturnValue(mockUpdateData);

      await strategy.applyResult(postId, result, fieldMappings, metadata);

      expect(mockPostRepository.findOne).toHaveBeenCalledWith({
        where: { id: postId },
      });
      expect(mockFieldMappingService.applyMappings).toHaveBeenCalledWith(
        result,
        fieldMappings,
      );
      expect(mockPostRepository.update).toHaveBeenCalledWith(
        postId,
        mockUpdateData,
      );
    });

    it('should throw NotFoundException when post does not exist', async () => {
      const postId = 'non-existent';
      const result = { status: 'approved' };
      const fieldMappings: FieldMappingConfig = {
        mappings: { status: 'status' },
      };

      mockPostRepository.findOne.mockResolvedValue(null);

      await expect(
        strategy.applyResult(postId, result, fieldMappings),
      ).rejects.toThrow('Post with ID non-existent not found');
    });
  });

  describe('handleError', () => {
    it('should handle error and update post status', async () => {
      const postId = 'post-1';
      const error = new Error('Processing failed');
      const fieldMappings: FieldMappingConfig = {
        statusField: 'status',
        statusValues: {
          error: PostStatus.PENDING,
        },
      };

      mockPostRepository.update.mockResolvedValue({ affected: 1 });

      await strategy.handleError(postId, error, fieldMappings);

      expect(mockPostRepository.update).toHaveBeenCalledWith(postId, {
        status: PostStatus.PENDING,
      });
    });

    it('should handle error gracefully when update fails', async () => {
      const postId = 'post-1';
      const error = new Error('Processing failed');
      const fieldMappings: FieldMappingConfig = {
        statusField: 'status',
        statusValues: {
          error: PostStatus.PENDING,
        },
      };

      mockPostRepository.update.mockRejectedValue(new Error('Update failed'));

      // Should not throw
      await expect(
        strategy.handleError(postId, error, fieldMappings),
      ).resolves.not.toThrow();
    });
  });

  describe('getSupportedResultSchemas', () => {
    it('should return empty array indicating all schemas supported', () => {
      const schemas = strategy.getSupportedResultSchemas();
      expect(schemas).toEqual([]);
    });
  });
});
