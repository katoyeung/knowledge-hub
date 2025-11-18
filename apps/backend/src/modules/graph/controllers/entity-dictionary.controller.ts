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
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { EntityDictionaryService } from '../services/entity-dictionary.service';
import { EntityLearningService } from '../services/entity-learning.service';
import { CreateEntityDto } from '../dto/create-entity.dto';
import { UpdateEntityDto } from '../dto/update-entity.dto';
import { BulkImportEntitiesDto } from '../dto/bulk-import-entities.dto';

@ApiTags('Entity Dictionary')
@ApiBearerAuth()
@UseGuards(JwtOrApiKeyAuthGuard)
@Controller('graph/entities')
export class EntityDictionaryController {
  constructor(
    private readonly entityDictionaryService: EntityDictionaryService,
    private readonly entityLearningService: EntityLearningService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Add entity' })
  @ApiResponse({ status: 201, description: 'Entity created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Entity already exists' })
  async addEntity(@Body() createDto: CreateEntityDto, @Request() req: any) {
    return this.entityDictionaryService.addEntity(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'List entities with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Entities retrieved successfully' })
  async findEntities(
    @Query('entityType') entityType?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.entityDictionaryService.findEntities({
      entityType,
      searchTerm,
      source: source as any,
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
    });
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get entity statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getEntityStatistics() {
    return this.entityDictionaryService.getEntityStatistics();
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get LLM-suggested entities' })
  @ApiResponse({
    status: 200,
    description: 'Suggestions retrieved successfully',
  })
  async getEntitySuggestions() {
    return this.entityLearningService.suggestNewEntities();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export entity dictionary' })
  @ApiResponse({ status: 200, description: 'Dictionary exported successfully' })
  async exportEntities(
    @Query('entityType') entityType?: string,
    @Query('searchTerm') searchTerm?: string,
    @Query('source') source?: string,
    @Query('minConfidence') minConfidence?: number,
  ) {
    return this.entityDictionaryService.exportEntities({
      entityType,
      searchTerm,
      source,
      minConfidence: minConfidence
        ? parseFloat(minConfidence.toString())
        : undefined,
    });
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import entities from CSV/JSON' })
  @ApiResponse({ status: 201, description: 'Entities imported successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkImportEntities(
    @Body() importDto: BulkImportEntitiesDto,
    @Request() req: any,
  ) {
    return this.entityDictionaryService.bulkImportEntities(
      req.user.id,
      importDto,
    );
  }

  @Post('auto-discover')
  @ApiOperation({
    summary:
      'Discover entities from existing graph data (returns without saving)',
  })
  @ApiResponse({ status: 200, description: 'Entities discovered successfully' })
  async autoDiscoverEntities(@Request() req: any) {
    const userId = req.user?.id || '72287e07-967e-4de6-88b0-ff8c16f43991';
    const discovered =
      await this.entityDictionaryService.discoverEntitiesFromGraph(userId);
    return {
      success: true,
      entities: discovered,
    };
  }

  @Post('discover-aliases')
  @ApiOperation({
    summary: 'Discover aliases for existing entities (returns without saving)',
  })
  @ApiResponse({ status: 200, description: 'Aliases discovered successfully' })
  async discoverAliases(@Request() req: any) {
    const userId = req.user?.id || '72287e07-967e-4de6-88b0-ff8c16f43991';
    const discovered =
      await this.entityDictionaryService.discoverAliasesFromGraph(userId);
    return {
      success: true,
      entities: discovered,
    };
  }

  @Get(':entityId')
  @ApiOperation({ summary: 'Get entity by ID' })
  @ApiResponse({ status: 200, description: 'Entity retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async getEntity(@Param('entityId', ParseUUIDPipe) entityId: string) {
    const result = await this.entityDictionaryService.findEntities({
      limit: 1000,
      offset: 0,
    });
    const found = result.entities.find((e) => e.id === entityId);
    if (!found) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }
    return found;
  }

  @Put(':entityId')
  @ApiOperation({ summary: 'Update entity' })
  @ApiResponse({ status: 200, description: 'Entity updated successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async updateEntity(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() updateDto: UpdateEntityDto,
  ) {
    return this.entityDictionaryService.updateEntity(entityId, updateDto);
  }

  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete entities by IDs' })
  @ApiResponse({ status: 200, description: 'Entities deleted successfully' })
  async bulkDeleteEntities(@Body() body: { ids?: string[] }) {
    if (body.ids && body.ids.length > 0) {
      return this.entityDictionaryService.bulkDeleteEntities(body.ids);
    }
    throw new BadRequestException('Entity IDs are required');
  }

  @Delete('all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all entities' })
  @ApiResponse({
    status: 200,
    description: 'All entities deleted successfully',
  })
  async deleteAllEntities() {
    return this.entityDictionaryService.deleteAllEntities();
  }

  @Delete(':entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete entity' })
  @ApiResponse({ status: 204, description: 'Entity deleted successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async deleteEntity(@Param('entityId', ParseUUIDPipe) entityId: string) {
    await this.entityDictionaryService.deleteEntity(entityId);
  }

  @Post(':entityId/aliases')
  @ApiOperation({ summary: 'Add alias to entity' })
  @ApiResponse({ status: 201, description: 'Alias added successfully' })
  async addAlias(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body()
    body: {
      alias: string;
      language?: string;
      script?: string;
      type?: string;
    },
  ) {
    // Update entity with new alias
    const entity = await this.entityDictionaryService.findEntities({
      limit: 1000,
      offset: 0,
    });
    const found = entity.entities.find((e) => e.id === entityId);
    if (!found) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    const existingAliases = found.aliases || [];
    const updatedEntity = await this.entityDictionaryService.updateEntity(
      entityId,
      {
        aliases: [
          ...existingAliases.map((a) => ({
            name: typeof a === 'string' ? a : a.alias,
            language: typeof a === 'object' ? a.language : undefined,
            script: typeof a === 'object' ? a.script : undefined,
            type: typeof a === 'object' ? a.type : undefined,
          })),
          {
            name: body.alias,
            language: body.language,
            script: body.script,
            type: body.type as any,
          },
        ],
      },
    );
    return updatedEntity;
  }

  @Delete(':entityId/aliases/:aliasId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove alias from entity' })
  @ApiResponse({ status: 204, description: 'Alias removed successfully' })
  async removeAlias(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ) {
    // Get entity to find the alias
    const result = await this.entityDictionaryService.findEntities({
      limit: 1000,
      offset: 0,
    });
    const found = result.entities.find((e) => e.id === entityId);
    if (!found) {
      throw new NotFoundException(`Entity with ID ${entityId} not found`);
    }

    // Filter out the alias to remove
    const existingAliases = (found.aliases || []).filter(
      (a) => (typeof a === 'object' ? a.id : null) !== aliasId,
    );

    await this.entityDictionaryService.updateEntity(entityId, {
      aliases: existingAliases.map((a) => ({
        name: typeof a === 'string' ? a : a.alias,
        language: typeof a === 'object' ? a.language : undefined,
        script: typeof a === 'object' ? a.script : undefined,
        type: typeof a === 'object' ? a.type : undefined,
      })),
    });
  }

  @Post('match')
  @ApiOperation({ summary: 'Find matching entities in text' })
  @ApiResponse({ status: 200, description: 'Matches found successfully' })
  async findMatchingEntities(
    @Body() body: { text: string; threshold?: number },
  ) {
    return this.entityDictionaryService.findMatchingEntities(
      body.text,
      body.threshold || 0.7,
    );
  }
}
