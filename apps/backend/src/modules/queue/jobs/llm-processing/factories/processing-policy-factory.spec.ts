import { Test, TestingModule } from '@nestjs/testing';
import { ProcessingPolicyFactory } from './processing-policy-factory';
import { PostProcessingPolicy } from '../policies/post-processing-policy';
import { SegmentProcessingPolicy } from '../policies/segment-processing-policy';
import { NotFoundException } from '@nestjs/common';

describe('ProcessingPolicyFactory', () => {
  let factory: ProcessingPolicyFactory;
  let postPolicy: PostProcessingPolicy;
  let segmentPolicy: SegmentProcessingPolicy;

  const mockPostPolicy = {
    getEntityType: jest.fn().mockReturnValue('post'),
  };

  const mockSegmentPolicy = {
    getEntityType: jest.fn().mockReturnValue('segment'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessingPolicyFactory,
        {
          provide: PostProcessingPolicy,
          useValue: mockPostPolicy,
        },
        {
          provide: SegmentProcessingPolicy,
          useValue: mockSegmentPolicy,
        },
      ],
    }).compile();

    factory = module.get<ProcessingPolicyFactory>(ProcessingPolicyFactory);
    postPolicy = module.get<PostProcessingPolicy>(PostProcessingPolicy);
    segmentPolicy = module.get<SegmentProcessingPolicy>(
      SegmentProcessingPolicy,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('getPolicy', () => {
    it('should return post policy for post entity type', () => {
      const policy = factory.getPolicy('post');
      expect(policy).toBe(postPolicy);
    });

    it('should return segment policy for segment entity type', () => {
      const policy = factory.getPolicy('segment');
      expect(policy).toBe(segmentPolicy);
    });

    it('should throw NotFoundException for unknown entity type', () => {
      expect(() => factory.getPolicy('unknown')).toThrow(NotFoundException);
      expect(() => factory.getPolicy('unknown')).toThrow(
        'No processing policy found for entity type: unknown',
      );
    });
  });

  describe('getRegisteredEntityTypes', () => {
    it('should return all registered entity types', () => {
      const types = factory.getRegisteredEntityTypes();
      expect(types).toContain('post');
      expect(types).toContain('segment');
    });
  });
});
