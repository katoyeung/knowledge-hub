import { Injectable, Logger } from '@nestjs/common';
import {
  EntityDictionaryService,
  EntityMatch,
} from './entity-dictionary.service';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { Prompt } from '../../prompts/entities/prompt.entity';
import { CreateGraphExtractionConfigDto } from '../dto/create-graph-extraction-config.dto';
import { EntityConstraintsDto } from '../dto/entity-constraints.dto';

export interface PreprocessedContent {
  originalContent: string;
  matchedEntities: EntityMatch[];
  constraints: EntityConstraintsDto;
  processedContent: string;
}

@Injectable()
export class HybridExtractionService {
  private readonly logger = new Logger(HybridExtractionService.name);

  constructor(
    private readonly entityDictionaryService: EntityDictionaryService,
  ) {}

  async preprocessText(
    content: string,
    datasetId: string,
    threshold: number = 0.7,
  ): Promise<PreprocessedContent> {
    this.logger.debug(`Preprocessing content for dataset ${datasetId}`);

    // Find matching entities in the content
    const matchedEntities =
      await this.entityDictionaryService.findMatchingEntities(
        content,
        threshold,
      );

    this.logger.debug(`Found ${matchedEntities.length} matching entities`);

    // Build constraints from matched entities
    const constraints = this.buildConstraintsFromMatches(matchedEntities);

    // Process content to highlight matched entities
    const processedContent = this.highlightMatchedEntities(
      content,
      matchedEntities,
    );

    return {
      originalContent: content,
      matchedEntities,
      constraints,
      processedContent,
    };
  }

  buildConstrainedPrompt(
    content: string,
    matchedEntities: EntityMatch[],
    originalPrompt: Prompt,
  ): string {
    this.logger.debug(
      `Building constrained prompt with ${matchedEntities.length} matched entities`,
    );

    if (matchedEntities.length === 0) {
      return originalPrompt.userPromptTemplate || content;
    }

    // Group entities by type
    const entitiesByType = matchedEntities.reduce(
      (acc, match) => {
        if (!acc[match.entity.entityType]) {
          acc[match.entity.entityType] = [];
        }
        acc[match.entity.entityType].push(match);
        return acc;
      },
      {} as Record<string, EntityMatch[]>,
    );

    // Build constraint section
    const constraintSections = Object.entries(entitiesByType).map(
      ([type, entities]) => {
        const entityList = entities
          .map((match) => {
            const aliases =
              match.entity.aliases?.map((alias) => alias.alias).join(', ') ||
              '';
            const aliasText = aliases ? ` (aliases: ${aliases})` : '';
            return `- ${match.entity.canonicalName}${aliasText}`;
          })
          .join('\n');

        return `**Known ${type}s in this content:**
${entityList}`;
      },
    );

    const constraintsText = constraintSections.join('\n\n');

    // Build the constrained prompt
    const constrainedPrompt = `${originalPrompt.userPromptTemplate || content}

**IMPORTANT CONSTRAINTS:**
The following entities are already known to exist in this content. Please use these exact names and types when extracting relationships:

${constraintsText}

**EXTRACTION RULES:**
1. Use the exact canonical names provided above for known entities
2. Only extract relationships between the known entities listed above
3. If you find additional entities not in the list above, extract them as new entities
4. Prioritize accuracy over completeness - only extract relationships you are confident about
5. For sentiment analysis, focus on the relationships between the known entities

**Content to analyze:**
${content}`;

    return constrainedPrompt;
  }

  async extractWithConstraints(
    segment: DocumentSegment,
    matchedEntities: EntityMatch[],
    config: CreateGraphExtractionConfigDto,
    originalPrompt: Prompt,
  ): Promise<{
    constrainedPrompt: string;
    matchedEntities: EntityMatch[];
    extractionConfig: CreateGraphExtractionConfigDto;
  }> {
    this.logger.debug(`Extracting with constraints for segment ${segment.id}`);

    // Build constrained prompt
    const constrainedPrompt = this.buildConstrainedPrompt(
      segment.content,
      matchedEntities,
      originalPrompt,
    );

    // Update extraction config to use constrained prompt
    const extractionConfig = {
      ...config,
      // Add metadata about constraints
      metadata: {
        constrainedExtraction: true,
        matchedEntityCount: matchedEntities.length,
        entityTypes: [
          ...new Set(matchedEntities.map((m) => m.entity.entityType)),
        ],
      },
    };

    return {
      constrainedPrompt,
      matchedEntities,
      extractionConfig,
    };
  }

  async processSegmentWithHybridExtraction(
    segment: DocumentSegment,
    datasetId: string,
    config: CreateGraphExtractionConfigDto,
    originalPrompt: Prompt,
    threshold: number = 0.7,
  ): Promise<{
    preprocessedContent: PreprocessedContent;
    constrainedPrompt: string;
    extractionConfig: CreateGraphExtractionConfigDto;
  }> {
    this.logger.debug(
      `Processing segment with hybrid extraction: ${segment.id}`,
    );

    // Step 1: Preprocess content to find matching entities
    const preprocessedContent = await this.preprocessText(
      segment.content,
      datasetId,
      threshold,
    );

    // Step 2: Build constrained prompt
    const constrainedPrompt = this.buildConstrainedPrompt(
      segment.content,
      preprocessedContent.matchedEntities,
      originalPrompt,
    );

    // Step 3: Prepare extraction config
    const extractionConfig = {
      ...config,
      metadata: {
        hybridExtraction: true,
        matchedEntityCount: preprocessedContent.matchedEntities.length,
        entityTypes: [
          ...new Set(
            preprocessedContent.matchedEntities.map((m) => m.entity.entityType),
          ),
        ],
        preprocessingThreshold: threshold,
      },
    };

    return {
      preprocessedContent,
      constrainedPrompt,
      extractionConfig,
    };
  }

  private buildConstraintsFromMatches(
    matches: EntityMatch[],
  ): EntityConstraintsDto {
    const entities = matches.map((match) => ({
      entityType: match.entity.entityType,
      canonicalName: match.entity.canonicalName,
      aliases: match.entity.aliases?.map((alias) => alias.alias) || [],
      confidence: match.similarity,
      description: match.entity.metadata?.description,
    }));

    return {
      entities,
      context: 'Pre-matched entities from dictionary',
      threshold: 0.7,
    };
  }

  private highlightMatchedEntities(
    content: string,
    matches: EntityMatch[],
  ): string {
    let processedContent = content;

    // Sort matches by similarity descending to prioritize higher confidence matches
    const sortedMatches = matches.sort((a, b) => b.similarity - a.similarity);

    for (const match of sortedMatches) {
      const entityName = match.entity.canonicalName;
      const matchedText = match.matchedText;

      // Only highlight if the matched text is different from the canonical name
      if (matchedText.toLowerCase() !== entityName.toLowerCase()) {
        // Replace the matched text with canonical name in brackets
        const regex = new RegExp(
          `\\b${matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'gi',
        );
        processedContent = processedContent.replace(regex, `[${entityName}]`);
      }
    }

    return processedContent;
  }

  async updateEntityUsageFromExtraction(
    extractionResult: any,
    matchedEntities: EntityMatch[],
    datasetId: string,
  ): Promise<void> {
    this.logger.debug(`Updating entity usage from extraction result`);

    // Track which entities were actually used in the extraction
    const usedEntities = new Set<string>();

    // Check nodes
    if (extractionResult.nodes) {
      for (const node of extractionResult.nodes) {
        const matchingEntity = matchedEntities.find(
          (match) =>
            match.entity.canonicalName.toLowerCase() ===
            node.label.toLowerCase(),
        );

        if (matchingEntity) {
          usedEntities.add(matchingEntity.entity.id);
          await this.entityDictionaryService.updateEntityFromUsage(
            matchingEntity.entity.id,
            {
              matchedAlias: matchingEntity.alias?.alias,
              nodeType: node.type,
              confidence: node.properties?.confidence,
            },
          );
        }
      }
    }

    // Check edges
    if (extractionResult.edges) {
      for (const edge of extractionResult.edges) {
        // Check if source or target nodes correspond to matched entities
        const sourceEntity = matchedEntities.find(
          (match) =>
            match.entity.canonicalName.toLowerCase() ===
            edge.sourceNodeLabel?.toLowerCase(),
        );
        const targetEntity = matchedEntities.find(
          (match) =>
            match.entity.canonicalName.toLowerCase() ===
            edge.targetNodeLabel?.toLowerCase(),
        );

        if (sourceEntity && !usedEntities.has(sourceEntity.entity.id)) {
          usedEntities.add(sourceEntity.entity.id);
          await this.entityDictionaryService.updateEntityFromUsage(
            sourceEntity.entity.id,
            {
              matchedAlias: sourceEntity.alias?.alias,
              edgeType: edge.edgeType,
              confidence: edge.properties?.confidence,
            },
          );
        }

        if (targetEntity && !usedEntities.has(targetEntity.entity.id)) {
          usedEntities.add(targetEntity.entity.id);
          await this.entityDictionaryService.updateEntityFromUsage(
            targetEntity.entity.id,
            {
              matchedAlias: targetEntity.alias?.alias,
              edgeType: edge.edgeType,
              confidence: edge.properties?.confidence,
            },
          );
        }
      }
    }

    this.logger.debug(`Updated usage for ${usedEntities.size} entities`);
  }
}
