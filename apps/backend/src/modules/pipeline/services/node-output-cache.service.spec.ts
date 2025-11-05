import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NodeOutputCacheService } from './node-output-cache.service';
import { WorkflowExecution } from '../entities/workflow-execution.entity';

describe('NodeOutputCacheService', () => {
  let service: NodeOutputCacheService;

  const mockExecutionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeOutputCacheService,
        {
          provide: getRepositoryToken(WorkflowExecution),
          useValue: mockExecutionRepository,
        },
      ],
    }).compile();

    service = module.get<NodeOutputCacheService>(NodeOutputCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
