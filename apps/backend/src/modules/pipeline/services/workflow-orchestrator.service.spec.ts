import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkflowOrchestrator } from './workflow-orchestrator.service';
import { Workflow } from '../entities/workflow.entity';
import { WorkflowExecution } from '../entities/workflow-execution.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { WorkflowExecutor } from './workflow-executor.service';
import { JobDispatcherService } from '../../queue/services/job-dispatcher.service';
import { EventBusService } from '../../event/services/event-bus.service';
import { NotificationService } from '../../notification/notification.service';
import { NodeOutputCacheService } from './node-output-cache.service';

describe('WorkflowOrchestrator', () => {
  let service: WorkflowOrchestrator;

  const mockWorkflowRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  } as any;

  const mockExecutionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findAndCount: jest.fn(),
  } as any;

  const mockSegmentRepository = {
    find: jest.fn(),
  } as any;

  const mockWorkflowExecutor = {
    executeWorkflow: jest.fn(),
  } as any;

  const mockJobDispatcher = {
    dispatch: jest.fn(),
  } as any;

  const mockEventBus = {
    publish: jest.fn(),
  } as any;

  const mockNotificationService = {
    sendWorkflowExecutionCompleted: jest.fn(),
    sendWorkflowExecutionFailed: jest.fn(),
    sendWorkflowExecutionUpdate: jest.fn(),
  } as any;

  const mockNodeOutputCache = {
    getNodeOutput: jest.fn(),
    storeNodeOutput: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowOrchestrator,
        {
          provide: getRepositoryToken(Workflow),
          useValue: mockWorkflowRepository,
        },
        {
          provide: getRepositoryToken(WorkflowExecution),
          useValue: mockExecutionRepository,
        },
        {
          provide: getRepositoryToken(DocumentSegment),
          useValue: mockSegmentRepository,
        },
        {
          provide: WorkflowExecutor,
          useValue: mockWorkflowExecutor,
        },
        {
          provide: JobDispatcherService,
          useValue: mockJobDispatcher,
        },
        {
          provide: EventBusService,
          useValue: mockEventBus,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: NodeOutputCacheService,
          useValue: mockNodeOutputCache,
        },
      ],
    }).compile();

    service = module.get<WorkflowOrchestrator>(WorkflowOrchestrator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
