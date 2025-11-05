import { Test, TestingModule } from '@nestjs/testing';
import { PostDeleterStep, PostDeleterConfig } from './post-deleter.step';
import { StepExecutionContext } from './base.step';
import { PostsService } from '../../posts/posts.service';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';

describe('PostDeleterStep', () => {
  let step: PostDeleterStep;
  let mockPostsService: jest.Mocked<PostsService>;
  let mockContext: StepExecutionContext;

  beforeEach(async () => {
    // Create mock PostsService
    mockPostsService = {
      batchDelete: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostDeleterStep,
        {
          provide: PostsService,
          useValue: mockPostsService,
        },
      ],
    }).compile();

    step = module.get<PostDeleterStep>(PostDeleterStep);

    mockContext = {
      executionId: 'test-execution-id',
      pipelineConfigId: 'test-pipeline-id',
      userId: 'test-user-id',
      logger: step['logger'],
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic ID Extraction', () => {
    it('should extract IDs from simple objects with id field', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({ id: 'post-1', title: 'Test Post 1' }),
        } as DocumentSegment,
        {
          id: 'seg-2',
          content: JSON.stringify({ id: 'post-2', title: 'Test Post 2' }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 2,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'post-1',
        'post-2',
      ] as any);
      expect(result.outputSegments).toHaveLength(1);
      expect(result.outputSegments[0]).toMatchObject({
        deleted: 2,
        requested: 2,
        failed: 0,
        postIds: ['post-1', 'post-2'],
      });
    });

    it('should handle custom ID field mapping', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({
            postId: 'custom-post-1',
            title: 'Test Post 1',
          }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'postId',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 1,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'custom-post-1',
      ] as any);
    });
  });

  describe('Duplicates Array Handling', () => {
    it('should extract IDs from duplicates array when field mapping is duplicates.id', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({
            items: [{ id: 'item-1' }],
            duplicates: [
              { id: 'dup-1', title: 'Duplicate 1' },
              { id: 'dup-2', title: 'Duplicate 2' },
              { id: 'dup-3', title: 'Duplicate 3' },
            ],
            total: 1,
            duplicate_count: 3,
          }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'duplicates.id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 3,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'dup-1',
        'dup-2',
        'dup-3',
      ] as any);
      expect(result.outputSegments).toHaveLength(1);
      expect(result.outputSegments[0]).toMatchObject({
        deleted: 3,
        requested: 3,
        failed: 0,
        postIds: ['dup-1', 'dup-2', 'dup-3'],
      });
    });

    it('should handle duplicates array with nested ID paths', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({
            duplicates: [
              { data: { id: 'nested-1' } },
              { data: { id: 'nested-2' } },
            ],
          }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'duplicates.data.id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 2,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'nested-1',
        'nested-2',
      ] as any);
    });
  });

  describe('Items Array Handling', () => {
    it('should extract IDs from items array when field mapping is items.id', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({
            items: [
              { id: 'item-1', title: 'Item 1' },
              { id: 'item-2', title: 'Item 2' },
            ],
            total: 2,
          }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'items.id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 2,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'item-1',
        'item-2',
      ] as any);
    });
  });

  describe('Data Array Handling', () => {
    it('should expand data array and extract IDs', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({
            data: [
              { id: 'data-1', title: 'Data 1' },
              { id: 'data-2', title: 'Data 2' },
            ],
          }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 2,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        'data-1',
        'data-2',
      ] as any);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty result when no IDs found', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({ title: 'No ID field' }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).not.toHaveBeenCalled();
      expect(result.outputSegments).toHaveLength(1);
      expect(result.outputSegments[0]).toMatchObject({
        deleted: 0,
        requested: 0,
        failed: 0,
        postIds: [],
      });
    });

    it('should handle partial deletion failures', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({ id: 'post-1' }),
        } as DocumentSegment,
        {
          id: 'seg-2',
          content: JSON.stringify({ id: 'post-2' }),
        } as DocumentSegment,
        {
          id: 'seg-3',
          content: JSON.stringify({ id: 'post-3' }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 2, // Only 2 out of 3 deleted
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(result.outputSegments[0]).toMatchObject({
        deleted: 2,
        requested: 3,
        failed: 1,
        postIds: ['post-1', 'post-2', 'post-3'],
      });
    });

    it('should handle empty input', async () => {
      const input: DocumentSegment[] = [];
      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).not.toHaveBeenCalled();
      expect(result.outputSegments).toHaveLength(1);
      expect(result.outputSegments[0]).toMatchObject({
        deleted: 0,
        requested: 0,
        failed: 0,
        postIds: [],
      });
    });
  });

  describe('Format Output', () => {
    it('should format output correctly for test step', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({ id: 'post-1' }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 1,
      });

      const result = await step.execute(input, config, mockContext);

      // Test formatOutput method
      const formatted = step.formatOutput(result, input);

      expect(formatted).toMatchObject({
        deleted: 1,
        requested: 1,
        failed: 0,
        postIds: ['post-1'],
      });
      expect(Array.isArray(formatted)).toBe(false); // Should be object, not array
    });

    it('should format output correctly when no IDs found', async () => {
      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify({ title: 'No ID' }),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'id',
        },
      };

      const result = await step.execute(input, config, mockContext);
      const formatted = step.formatOutput(result, input);

      expect(formatted).toMatchObject({
        deleted: 0,
        requested: 0,
        failed: 0,
        postIds: [],
      });
    });
  });

  describe('Real-world Scenario from User Request', () => {
    it('should handle previousOutput with duplicates array and duplicates.id mapping', async () => {
      // This matches the structure from the user's curl request
      const previousOutput = {
        items: [
          {
            id: '3e44acc1-c94e-4302-b4a2-687dd2a413f8',
            title: 'Test post',
          },
        ],
        total: 1,
        duplicates: [
          {
            id: '805d4ade-205c-40a2-81fc-b772b9dd8ba0',
            title: 'Duplicate 1',
          },
          {
            id: 'c68a1b63-6c27-4e56-8759-90d058fc5981',
            title: 'Duplicate 2',
          },
          {
            id: '0920d12b-989e-4c5f-8d26-555732951308',
            title: 'Duplicate 3',
          },
        ],
        duplicate_count: 3,
      };

      const input: DocumentSegment[] = [
        {
          id: 'seg-1',
          content: JSON.stringify(previousOutput),
        } as DocumentSegment,
      ];

      const config: PostDeleterConfig = {
        fieldMappings: {
          id: 'duplicates.id',
        },
      };

      mockPostsService.batchDelete.mockResolvedValue({
        deleted: 3,
      });

      const result = await step.execute(input, config, mockContext);

      expect(result.success).toBe(true);
      expect(mockPostsService.batchDelete).toHaveBeenCalledWith([
        '805d4ade-205c-40a2-81fc-b772b9dd8ba0',
        'c68a1b63-6c27-4e56-8759-90d058fc5981',
        '0920d12b-989e-4c5f-8d26-555732951308',
      ] as any);

      // Test formatOutput
      const formatted = step.formatOutput(result, input);
      expect(formatted).toMatchObject({
        deleted: 3,
        requested: 3,
        failed: 0,
        postIds: expect.arrayContaining([
          '805d4ade-205c-40a2-81fc-b772b9dd8ba0',
          'c68a1b63-6c27-4e56-8759-90d058fc5981',
          '0920d12b-989e-4c5f-8d26-555732951308',
        ]),
      });
    });
  });
});
