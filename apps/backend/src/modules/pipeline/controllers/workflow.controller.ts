import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { Workflow } from '../entities/workflow.entity';
import {
  WorkflowExecution,
  NodeExecutionSnapshot,
} from '../entities/workflow-execution.entity';
import { WorkflowOrchestrator } from '../services/workflow-orchestrator.service';
import { WorkflowService } from '../services/workflow.service';
import { PipelineStepRegistry } from '../services/pipeline-step-registry.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto/workflow.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@ApiTags('Workflow')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyAuthGuard)
@Controller('workflow')
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(
    private readonly workflowOrchestrator: WorkflowOrchestrator,
    private readonly workflowService: WorkflowService,
    private readonly stepRegistry: PipelineStepRegistry,
    @InjectRepository(Workflow)
    private readonly workflowRepository: Repository<Workflow>,
  ) {}

  @Post('execute')
  @ApiOperation({ summary: 'Execute a workflow asynchronously' })
  @ApiResponse({
    status: 200,
    description: 'Workflow execution queued successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @HttpCode(HttpStatus.OK)
  async executeWorkflow(
    @Body() request: any,
    @Request() req: any,
  ): Promise<any> {
    // Handle data source configuration (keep this async but don't wait if not needed)
    let inputData = request.inputData || [];

    // Prepare data source config update asynchronously (don't block response)
    const dataSourceUpdatePromise = request.dataSourceConfig
      ? (async () => {
          const dataSourceNode = {
            id: `datasource_${Date.now()}`,
            type: 'datasource',
            name: 'Data Source',
            position: { x: 0, y: 0 },
            config: request.dataSourceConfig,
            enabled: true,
          };

          const workflow = await this.workflowService.getWorkflow(
            request.workflowId,
            req.user.id,
          );
          if (workflow) {
            workflow.nodes = [dataSourceNode, ...workflow.nodes];
            await this.workflowRepository.save(workflow);
          }
        })()
      : Promise.resolve();

    // Execute workflow async immediately (don't wait for data source update)
    const executionPromise = this.workflowOrchestrator.executeWorkflowAsync({
      workflowId: request.workflowId,
      documentId: request.documentId,
      datasetId: request.datasetId,
      userId: req.user.id,
      inputData: inputData,
      options: request.options,
      triggerSource: request.triggerSource || 'manual',
      triggerData: request.triggerData,
    });

    // Return immediately after queuing the job, don't wait for data source update
    const result = await executionPromise;

    // Start data source update in background (don't await)
    dataSourceUpdatePromise.catch((error) => {
      this.logger.warn('Failed to update data source config:', error);
    });

    return result;
  }

  @Post('execute/sync')
  @ApiOperation({ summary: 'Execute a workflow synchronously' })
  @ApiResponse({
    status: 200,
    description: 'Workflow execution completed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @HttpCode(HttpStatus.OK)
  async executeWorkflowSync(
    @Body() request: any,
    @Request() req: any,
  ): Promise<any> {
    return await this.workflowOrchestrator.executeWorkflowSync({
      workflowId: request.workflowId,
      documentId: request.documentId,
      datasetId: request.datasetId,
      userId: req.user.id,
      inputData: request.inputData,
      options: request.options,
      triggerSource: request.triggerSource || 'manual',
      triggerData: request.triggerData,
    });
  }

  @Get('executions/:executionId')
  @ApiOperation({ summary: 'Get workflow execution status' })
  @ApiResponse({
    status: 200,
    description: 'Execution status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getExecutionStatus(
    @Param('executionId') executionId: string,
    @Request() req: any,
  ): Promise<WorkflowExecution> {
    const execution =
      await this.workflowOrchestrator.getExecutionStatus(executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }
    return execution;
  }

  @Get('executions/:executionId/snapshots')
  @ApiOperation({ summary: 'Get all node execution snapshots' })
  @ApiResponse({
    status: 200,
    description: 'Node snapshots retrieved successfully',
  })
  async getExecutionSnapshots(
    @Param('executionId') executionId: string,
    @Request() req: any,
  ): Promise<NodeExecutionSnapshot[]> {
    return await this.workflowOrchestrator.getExecutionSnapshots(executionId);
  }

  @Get('executions/:executionId/snapshots/:nodeId')
  @ApiOperation({ summary: 'Get specific node execution snapshot' })
  @ApiResponse({
    status: 200,
    description: 'Node snapshot retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Node snapshot not found' })
  async getNodeSnapshot(
    @Param('executionId') executionId: string,
    @Param('nodeId') nodeId: string,
    @Request() req: any,
  ): Promise<NodeExecutionSnapshot> {
    const snapshot = await this.workflowOrchestrator.getNodeSnapshot(
      executionId,
      nodeId,
    );
    if (!snapshot) {
      throw new Error('Node snapshot not found');
    }
    return snapshot;
  }

  @Post('executions/:executionId/cancel')
  @ApiOperation({ summary: 'Cancel a workflow execution' })
  @ApiResponse({
    status: 200,
    description: 'Execution cancelled successfully',
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  @HttpCode(HttpStatus.OK)
  async cancelExecution(
    @Param('executionId') executionId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    return await this.workflowOrchestrator.cancelExecution(
      executionId,
      req.user.id,
      body.reason,
    );
  }

  @Delete('executions/batch')
  @ApiOperation({ summary: 'Delete multiple workflow executions' })
  @ApiResponse({
    status: 200,
    description: 'Executions deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid execution IDs' })
  @HttpCode(HttpStatus.OK)
  async deleteExecutions(
    @Body() body: { executionIds: string[] },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string; deletedCount: number }> {
    return await this.workflowService.deleteExecutions(
      body.executionIds,
      req.user.id,
    );
  }

  @Delete('executions/:executionId')
  @ApiOperation({ summary: 'Delete a workflow execution' })
  @ApiResponse({
    status: 200,
    description: 'Execution deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  @HttpCode(HttpStatus.OK)
  async deleteExecution(
    @Param('executionId') executionId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    return await this.workflowService.deleteExecution(executionId, req.user.id);
  }

  @Get('steps')
  @ApiOperation({ summary: 'Get all available workflow step types' })
  @ApiResponse({
    status: 200,
    description: 'Workflow steps retrieved successfully',
  })
  async getAvailableSteps(): Promise<any[]> {
    return this.stepRegistry.getAllSteps();
  }

  @Get('steps/debug/registered')
  @ApiOperation({ summary: 'Debug: Get all registered step types' })
  @ApiResponse({
    status: 200,
    description: 'List of registered step types',
  })
  async getRegisteredStepTypes(): Promise<{ types: string[]; count: number }> {
    const types = this.stepRegistry.getStepTypes();
    return { types, count: types.length };
  }

  @Get('steps/:type')
  @ApiOperation({ summary: 'Get workflow step configuration schema' })
  @ApiResponse({
    status: 200,
    description: 'Step schema retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Step type not found' })
  async getStepSchema(@Param('type') type: string): Promise<any> {
    const schema = this.stepRegistry.getStepConfigSchema(type);
    if (!schema) {
      throw new Error(`Step type not found: ${type}`);
    }
    return schema;
  }

  @Post('steps/:type/validate')
  @ApiOperation({ summary: 'Validate step configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration validation completed',
  })
  @HttpCode(HttpStatus.OK)
  async validateStepConfig(
    @Param('type') type: string,
    @Body() config: any,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    return await this.stepRegistry.validateStepConfig(type, config);
  }

  // CRUD endpoints for workflows
  @Get('configs')
  @ApiOperation({ summary: 'Get all workflows' })
  @ApiResponse({
    status: 200,
    description: 'Workflows retrieved successfully',
  })
  @ApiQuery({ name: 'datasetId', required: false, type: String })
  @ApiQuery({ name: 'isTemplate', required: false, type: Boolean })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'tags', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getWorkflows(
    @Request() req: any,
    @Query('datasetId') datasetId?: string,
    @Query('isTemplate') isTemplate?: boolean,
    @Query('isActive') isActive?: boolean,
    @Query('tags') tags?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ workflows: Workflow[]; total: number }> {
    return await this.workflowService.getWorkflows(
      req.user.id,
      {
        datasetId,
        isTemplate,
        isActive,
        tags,
      },
      limit || 50,
      offset || 0,
    );
  }

  @Get('configs/:id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiResponse({
    status: 200,
    description: 'Workflow retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async getWorkflow(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Workflow> {
    return await this.workflowService.getWorkflow(id, req.user.id);
  }

  @Post('configs')
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiResponse({
    status: 201,
    description: 'Workflow created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @HttpCode(HttpStatus.CREATED)
  async createWorkflow(
    @Body() createDto: CreateWorkflowDto,
    @Request() req: any,
  ): Promise<Workflow> {
    return await this.workflowService.createWorkflow(createDto, req.user.id);
  }

  @Put('configs/:id')
  @ApiOperation({ summary: 'Update workflow' })
  @ApiResponse({
    status: 200,
    description: 'Workflow updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async updateWorkflow(
    @Param('id') id: string,
    @Body() updateDto: UpdateWorkflowDto,
    @Request() req: any,
  ): Promise<Workflow> {
    return await this.workflowService.updateWorkflow(
      id,
      updateDto,
      req.user.id,
    );
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: 'Delete workflow' })
  @ApiResponse({
    status: 200,
    description: 'Workflow deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @HttpCode(HttpStatus.OK)
  async deleteWorkflow(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.workflowService.deleteWorkflow(id, req.user.id);
    return { success: true, message: 'Workflow deleted successfully' };
  }

  @Get('executions')
  @ApiOperation({ summary: 'Get all executions for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Executions retrieved successfully',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getAllExecutions(
    @Request() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ executions: WorkflowExecution[]; total: number }> {
    return await this.workflowService.getAllExecutions(
      req.user.id,
      limit || 50,
      offset || 0,
    );
  }

  @Get('configs/:id/executions')
  @ApiOperation({ summary: 'Get workflow execution history' })
  @ApiResponse({
    status: 200,
    description: 'Execution history retrieved successfully',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getWorkflowExecutions(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ executions: WorkflowExecution[]; total: number }> {
    return await this.workflowService.getWorkflowExecutions(
      id,
      limit || 50,
      offset || 0,
    );
  }

  @Get('configs/:id/stats')
  @ApiOperation({ summary: 'Get workflow statistics' })
  @ApiResponse({
    status: 200,
    description: 'Workflow statistics retrieved successfully',
  })
  async getWorkflowStats(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    lastExecution?: Date;
  }> {
    return await this.workflowService.getWorkflowStats(id, req.user.id);
  }

  @Post('configs/:id/duplicate')
  @ApiOperation({ summary: 'Duplicate workflow' })
  @ApiResponse({
    status: 201,
    description: 'Workflow duplicated successfully',
  })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @HttpCode(HttpStatus.CREATED)
  async duplicateWorkflow(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Workflow> {
    return await this.workflowService.duplicateWorkflow(id, req.user.id);
  }

  @Post('steps/test')
  @ApiOperation({ summary: 'Test a workflow step with actual data' })
  @ApiResponse({
    status: 200,
    description: 'Step test completed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid step configuration' })
  @HttpCode(HttpStatus.OK)
  async testStep(
    @Body()
    request: {
      stepType: string;
      config: any;
      userId: string;
      inputSegments?: any[];
      previousOutput?: any;
    },
    @Request() req: any,
  ): Promise<any> {
    return await this.workflowService.testStep(
      request.stepType,
      request.config,
      req.user.id,
      request.inputSegments,
      request.previousOutput,
    );
  }
}
