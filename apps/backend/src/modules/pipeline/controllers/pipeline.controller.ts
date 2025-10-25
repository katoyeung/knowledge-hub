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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { PipelineConfig } from '../entities/pipeline-config.entity';
import { PipelineExecution } from '../entities/pipeline-execution.entity';
import { PipelineOrchestrator } from '../services/pipeline-orchestrator.service';
import { PipelineStepRegistry } from '../services/pipeline-step-registry.service';
import { PipelineConfigService } from '../services/pipeline-config.service';
import {
  CreatePipelineConfigDto,
  UpdatePipelineConfigDto,
  ExecutePipelineDto,
  PipelineExecutionResponseDto,
} from '../dto/create-pipeline-config.dto';

@ApiTags('Pipeline')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyAuthGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(
    private readonly pipelineOrchestrator: PipelineOrchestrator,
    private readonly stepRegistry: PipelineStepRegistry,
    private readonly pipelineConfigService: PipelineConfigService,
  ) {}

  @Post('configs')
  @ApiOperation({ summary: 'Create a new pipeline configuration' })
  @ApiResponse({
    status: 201,
    description: 'Pipeline configuration created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createPipelineConfig(
    @Body() createDto: CreatePipelineConfigDto,
    @Request() req: any,
  ): Promise<PipelineConfig> {
    return await this.pipelineConfigService.createPipelineConfig(
      createDto,
      req.user.id,
    );
  }

  @Get('configs')
  @ApiOperation({ summary: 'Get all pipeline configurations' })
  @ApiQuery({
    name: 'datasetId',
    required: false,
    description: 'Filter by dataset ID',
  })
  @ApiQuery({
    name: 'isTemplate',
    required: false,
    description: 'Filter by template status',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filter by active status',
  })
  @ApiResponse({
    status: 200,
    description: 'Pipeline configurations retrieved successfully',
  })
  async getPipelineConfigs(
    @Request() req: any,
    @Query('datasetId') datasetId?: string,
    @Query('isTemplate') isTemplate?: boolean,
    @Query('isActive') isActive?: boolean,
  ): Promise<PipelineConfig[]> {
    return await this.pipelineConfigService.getPipelineConfigs(req.user.id, {
      datasetId,
      isTemplate,
      isActive,
    });
  }

  @Get('configs/:id')
  @ApiOperation({ summary: 'Get a pipeline configuration by ID' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline configuration retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Pipeline configuration not found' })
  async getPipelineConfig(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<PipelineConfig> {
    return await this.pipelineConfigService.getPipelineConfig(id, req.user.id);
  }

  @Put('configs/:id')
  @ApiOperation({ summary: 'Update a pipeline configuration' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline configuration updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Pipeline configuration not found' })
  async updatePipelineConfig(
    @Param('id') id: string,
    @Body() updateDto: UpdatePipelineConfigDto,
    @Request() req: any,
  ): Promise<PipelineConfig> {
    return await this.pipelineConfigService.updatePipelineConfig(
      id,
      updateDto,
      req.user.id,
    );
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: 'Delete a pipeline configuration' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline configuration deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Pipeline configuration not found' })
  @HttpCode(HttpStatus.OK)
  async deletePipelineConfig(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.pipelineConfigService.deletePipelineConfig(id, req.user.id);
    return {
      success: true,
      message: 'Pipeline configuration deleted successfully',
    };
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute a pipeline' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline execution started successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @HttpCode(HttpStatus.OK)
  async executePipeline(
    @Body() executeDto: ExecutePipelineDto,
    @Request() req: any,
  ): Promise<PipelineExecutionResponseDto> {
    return await this.pipelineOrchestrator.executePipelineAsync({
      pipelineConfigId: executeDto.pipelineConfigId,
      documentId: executeDto.documentId,
      datasetId: executeDto.datasetId,
      userId: req.user.id,
      segmentIds: executeDto.segmentIds,
      options: executeDto.options,
      triggerSource: executeDto.triggerSource || 'manual',
      triggerData: executeDto.triggerData,
    });
  }

  @Post('execute/sync')
  @ApiOperation({ summary: 'Execute a pipeline synchronously' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline execution completed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @HttpCode(HttpStatus.OK)
  async executePipelineSync(
    @Body() executeDto: ExecutePipelineDto,
    @Request() req: any,
  ): Promise<PipelineExecutionResponseDto> {
    return await this.pipelineOrchestrator.executePipelineSync({
      pipelineConfigId: executeDto.pipelineConfigId,
      documentId: executeDto.documentId,
      datasetId: executeDto.datasetId,
      userId: req.user.id,
      segmentIds: executeDto.segmentIds,
      options: executeDto.options,
      triggerSource: executeDto.triggerSource || 'manual',
      triggerData: executeDto.triggerData,
    });
  }

  @Get('executions/:executionId')
  @ApiOperation({ summary: 'Get pipeline execution status' })
  @ApiResponse({
    status: 200,
    description: 'Execution status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getExecutionStatus(
    @Param('executionId') executionId: string,
    @Request() req: any,
  ): Promise<PipelineExecution> {
    const execution =
      await this.pipelineOrchestrator.getExecutionStatus(executionId);
    if (!execution) {
      throw new Error('Execution not found');
    }
    return execution;
  }

  @Post('executions/:executionId/cancel')
  @ApiOperation({ summary: 'Cancel a pipeline execution' })
  @ApiResponse({ status: 200, description: 'Execution cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  @HttpCode(HttpStatus.OK)
  async cancelExecution(
    @Param('executionId') executionId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    return await this.pipelineOrchestrator.cancelExecution(
      executionId,
      req.user.id,
      body.reason,
    );
  }

  @Get('configs/:id/executions')
  @ApiOperation({
    summary: 'Get execution history for a pipeline configuration',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of executions to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of executions to skip',
  })
  @ApiResponse({
    status: 200,
    description: 'Execution history retrieved successfully',
  })
  async getExecutionHistory(
    @Param('id') pipelineConfigId: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @Request() req: any,
  ): Promise<{ executions: PipelineExecution[]; total: number }> {
    return await this.pipelineOrchestrator.getExecutionHistory(
      pipelineConfigId,
      limit,
      offset,
    );
  }

  @Get('steps')
  @ApiOperation({ summary: 'Get all available pipeline steps' })
  @ApiResponse({
    status: 200,
    description: 'Pipeline steps retrieved successfully',
  })
  async getAvailableSteps(): Promise<any[]> {
    return this.stepRegistry.getAllSteps();
  }

  @Get('steps/:type')
  @ApiOperation({ summary: 'Get pipeline step configuration schema' })
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
}
