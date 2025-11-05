import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkflowExecutor } from './workflow-executor.service';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { PipelineStepRegistry } from './pipeline-step-registry.service';
import { NodeOutputCacheService } from './node-output-cache.service';
import { NotificationService } from '../../notification/notification.service';

describe('WorkflowExecutor', () => {
  let service: WorkflowExecutor;

  const mockExecutionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  } as any;

  const mockStepRegistry = {
    getStepTypes: jest.fn(),
    createStepInstance: jest.fn(),
  } as any;

  const mockNodeOutputCache = {
    storeNodeOutput: jest.fn(),
    getNodeOutput: jest.fn(),
  } as any;

  const mockNotificationService = {
    sendWorkflowExecutionUpdate: jest.fn(),
    sendWorkflowExecutionCompleted: jest.fn(),
    sendWorkflowExecutionFailed: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutor,
        {
          provide: getRepositoryToken(WorkflowExecution),
          useValue: mockExecutionRepository,
        },
        {
          provide: PipelineStepRegistry,
          useValue: mockStepRegistry,
        },
        {
          provide: NodeOutputCacheService,
          useValue: mockNodeOutputCache,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<WorkflowExecutor>(WorkflowExecutor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
