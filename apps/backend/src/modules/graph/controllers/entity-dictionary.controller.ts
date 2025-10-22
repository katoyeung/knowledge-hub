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
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EntityDictionaryService } from '../services/entity-dictionary.service';
import { EntityLearningService } from '../services/entity-learning.service';
import { CreatePredefinedEntityDto } from '../dto/create-predefined-entity.dto';
import { UpdatePredefinedEntityDto } from '../dto/update-predefined-entity.dto';
import { BulkImportEntitiesDto } from '../dto/bulk-import-entities.dto';

@ApiTags('Entity Dictionary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('graph/datasets/:datasetId/entities')
export class EntityDictionaryController {
  constructor(
    private readonly entityDictionaryService: EntityDictionaryService,
    private readonly entityLearningService: EntityLearningService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add predefined entity' })
  @ApiResponse({ status: 201, description: 'Entity created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Entity already exists' })
  async addPredefinedEntity(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body() createDto: CreatePredefinedEntityDto,
    @Request() req: any,
  ) {
    return this.entityDictionaryService.addPredefinedEntity(
      datasetId,
      req.user.id,
      createDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List entities with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Entities retrieved successfully' })
  async findEntities(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Query('entityType') entityType?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.entityDictionaryService.findEntities(datasetId, {
      entityType,
      searchTerm,
      source: source as any,
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
    });
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get entity statistics for dataset' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getEntityStatistics(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
  ) {
    return this.entityDictionaryService.getEntityStatistics(datasetId);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get LLM-suggested entities' })
  @ApiResponse({
    status: 200,
    description: 'Suggestions retrieved successfully',
  })
  async getEntitySuggestions(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
  ) {
    return this.entityLearningService.suggestNewEntities(datasetId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export entity dictionary' })
  @ApiResponse({ status: 200, description: 'Dictionary exported successfully' })
  async exportEntities(@Param('datasetId', ParseUUIDPipe) datasetId: string) {
    return this.entityDictionaryService.exportEntities(datasetId);
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import entities from CSV/JSON' })
  @ApiResponse({ status: 201, description: 'Entities imported successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkImportEntities(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body() importDto: BulkImportEntitiesDto,
    @Request() req: any,
  ) {
    return this.entityDictionaryService.bulkImportEntities(
      datasetId,
      req.user.id,
      importDto,
    );
  }

  @Post('auto-discover')
  @ApiOperation({ summary: 'Build dictionary from existing graph data' })
  @ApiResponse({ status: 201, description: 'Dictionary built successfully' })
  async autoDiscoverEntities(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || '72287e07-967e-4de6-88b0-ff8c16f43991';
    return this.entityDictionaryService.buildInitialDictionary(
      datasetId,
      userId,
    );
  }

  @Post('discover-aliases')
  @ApiOperation({ summary: 'Discover aliases for existing entities' })
  @ApiResponse({ status: 200, description: 'Aliases discovered successfully' })
  async discoverAliases(@Param('datasetId', ParseUUIDPipe) datasetId: string) {
    await this.entityLearningService.discoverEntityAliases(datasetId);
    return { message: 'Alias discovery completed' };
  }

  @Get(':entityId')
  @ApiOperation({ summary: 'Get entity by ID' })
  @ApiResponse({ status: 200, description: 'Entity retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async getEntity(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    // This would be implemented in the service
    throw new Error('Not implemented yet');
  }

  @Put(':entityId')
  @ApiOperation({ summary: 'Update predefined entity' })
  @ApiResponse({ status: 200, description: 'Entity updated successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async updatePredefinedEntity(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() updateDto: UpdatePredefinedEntityDto,
  ) {
    return this.entityDictionaryService.updatePredefinedEntity(
      entityId,
      updateDto,
    );
  }

  @Delete(':entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete predefined entity' })
  @ApiResponse({ status: 204, description: 'Entity deleted successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async deletePredefinedEntity(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    await this.entityDictionaryService.deletePredefinedEntity(entityId);
  }

  @Post(':entityId/aliases')
  @ApiOperation({ summary: 'Add alias to entity' })
  @ApiResponse({ status: 201, description: 'Alias added successfully' })
  async addAlias(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() body: { alias: string },
  ) {
    // This would be implemented in the service
    throw new Error('Not implemented yet');
  }

  @Delete(':entityId/aliases/:aliasId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove alias from entity' })
  @ApiResponse({ status: 204, description: 'Alias removed successfully' })
  async removeAlias(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ) {
    // This would be implemented in the service
    throw new Error('Not implemented yet');
  }

  @Post('match')
  @ApiOperation({ summary: 'Find matching entities in text' })
  @ApiResponse({ status: 200, description: 'Matches found successfully' })
  async findMatchingEntities(
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body() body: { text: string; threshold?: number },
  ) {
    return this.entityDictionaryService.findMatchingEntities(
      body.text,
      datasetId,
      body.threshold || 0.7,
    );
  }
}
