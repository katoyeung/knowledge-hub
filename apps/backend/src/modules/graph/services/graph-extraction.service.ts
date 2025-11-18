import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GraphNode, NodeType } from '../entities/graph-node.entity';
import { GraphEdge, EdgeType } from '../entities/graph-edge.entity';
import { DocumentSegment } from '../../dataset/entities/document-segment.entity';
import { Dataset } from '../../dataset/entities/dataset.entity';
import { Prompt } from '../../prompts/entities/prompt.entity';
import { AiProviderService } from '../../ai-provider/services/ai-provider.service';
import { PromptService } from '../../prompts/services/prompt.service';
import { LLMClientFactory } from '../../ai-provider/services/llm-client-factory.service';
import { CreateGraphExtractionConfigDto } from '../dto/create-graph-extraction-config.dto';
import { NotificationService } from '../../notification/notification.service';
import { GraphPromptSelectorService } from './graph-prompt-selector.service';
import { HybridExtractionService } from './hybrid-extraction.service';
import { EntityNormalizationService } from './entity-normalization.service';
import { EntityLearningService } from './entity-learning.service';
import { EntityDictionaryService } from './entity-dictionary.service';
import { EntitySource } from '../entities/graph-entity.entity';
import { LLMExtractionService } from '@common/services/llm-extraction.service';

interface ExtractedNode {
  type: NodeType;
  label: string;
  properties?: {
    normalized_name?: string;
    channel?: string;
    verified?: boolean;
    sentiment_score?: number;
    confidence?: number;
    temporal_data?: {
      first_mentioned: string;
      mention_count: number;
    };
    [key: string]: any;
  };
}

interface ExtractedEdge {
  sourceNodeLabel: string;
  targetNodeLabel: string;
  edgeType: EdgeType;
  weight?: number;
  properties?: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    sentiment_score?: number;
    interaction_count?: number;
    confidence?: number;
    context?: string;
    [key: string]: any;
  };
}

interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

@Injectable()
export class GraphExtractionService {
  private readonly logger = new Logger(GraphExtractionService.name);

  constructor(
    @InjectRepository(GraphNode)
    private readonly nodeRepository: Repository<GraphNode>,
    @InjectRepository(GraphEdge)
    private readonly edgeRepository: Repository<GraphEdge>,
    @InjectRepository(DocumentSegment)
    private readonly segmentRepository: Repository<DocumentSegment>,
    @InjectRepository(Dataset)
    private readonly datasetRepository: Repository<Dataset>,
    @InjectRepository(Prompt)
    private readonly promptRepository: Repository<Prompt>,
    private readonly aiProviderService: AiProviderService,
    private readonly promptService: PromptService,
    private readonly llmClientFactory: LLMClientFactory,
    private readonly notificationService: NotificationService,
    private readonly graphPromptSelectorService: GraphPromptSelectorService,
    private readonly hybridExtractionService: HybridExtractionService,
    private readonly entityNormalizationService: EntityNormalizationService,
    private readonly entityLearningService: EntityLearningService,
    private readonly entityDictionaryService: EntityDictionaryService,
    private readonly llmExtractionService: LLMExtractionService,
  ) {}

  async extractFromSegments(
    segmentIds: string[],
    datasetId: string,
    documentId: string,
    userId: string,
    config?: CreateGraphExtractionConfigDto,
  ): Promise<{ nodesCreated: number; edgesCreated: number }> {
    this.logger.log(
      `🚀 Starting graph extraction for ${segmentIds.length} segments`,
    );

    // Resolve settings - prioritize provided config, then fall back to dataset settings
    let resolvedConfig: CreateGraphExtractionConfigDto;

    // Check if provided config has required fields
    const hasRequiredConfig = config?.aiProviderId && config?.model;

    if (hasRequiredConfig) {
      // Use provided config as base
      resolvedConfig = {
        aiProviderId: config.aiProviderId,
        model: config.model,
        promptId: config.promptId,
        temperature: config.temperature || 0.7,
        enableDeduplication: config.enableDeduplication ?? true,
        batchSize: config.batchSize || 1,
        confidenceThreshold: config.confidenceThreshold || 0.5,
        ...config,
      };
      this.logger.log(
        `🔍 Using provided config: ${JSON.stringify(resolvedConfig, null, 2)}`,
      );
    } else {
      // Fall back to dataset graph settings
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
        select: ['settings'],
      });

      if (dataset?.settings?.graph_settings) {
        // Validate required fields
        if (!dataset.settings.graph_settings.aiProviderId) {
          throw new Error(
            'AI Provider ID is required in dataset graph settings',
          );
        }
        if (!dataset.settings.graph_settings.model) {
          throw new Error('Model is required in dataset graph settings');
        }

        resolvedConfig = {
          aiProviderId: dataset.settings.graph_settings.aiProviderId,
          model: dataset.settings.graph_settings.model,
          promptId: dataset.settings.graph_settings.promptId,
          temperature: dataset.settings.graph_settings.temperature || 0.7,
          enableDeduplication: true,
          batchSize: 1,
          confidenceThreshold: 0.5,
        };
        this.logger.log(
          `🔍 Using dataset graph settings: ${JSON.stringify(resolvedConfig, null, 2)}`,
        );
      } else {
        throw new Error(
          'Dataset graph settings not found. Please configure AI provider and model in dataset settings or provide them in the request.',
        );
      }

      // Merge with provided config if any (to override defaults)
      if (config) {
        resolvedConfig = { ...resolvedConfig, ...config };
      }
    }

    // Send start notification
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'started',
      totalSegments: segmentIds.length,
      message: `Starting graph extraction for ${segmentIds.length} segments`,
    });

    // Fetch segments and filter out already processed ones
    const allSegments = await this.segmentRepository.find({
      where: { id: In(segmentIds) },
      relations: ['document'],
    });

    // Filter segments that haven't been processed for graph extraction yet
    // Check both the status field and actual graph data existence
    const segmentsToProcess = [];

    for (const segment of allSegments) {
      // Skip if already processing
      if (segment.graphExtractionStatus === 'processing') {
        continue;
      }

      // Check if segment actually has graph data in the database
      const nodeCount = await this.nodeRepository.count({
        where: { segmentId: segment.id },
      });

      const hasGraphData = nodeCount > 0;

      // Only process if no graph data exists, regardless of status
      if (!hasGraphData) {
        segmentsToProcess.push(segment);
      }
    }

    const segments = segmentsToProcess;

    this.logger.log(
      `Found ${allSegments.length} total segments, ${segments.length} need graph extraction processing`,
    );

    if (segments.length === 0) {
      this.logger.log('All segments already processed for graph extraction');
      return { nodesCreated: 0, edgesCreated: 0 };
    }

    // Get extraction prompt
    const prompt = await this.getExtractionPrompt(
      resolvedConfig.promptId,
      datasetId,
      documentId,
    );

    if (!prompt) {
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'error',
          message: 'Graph extraction prompt not found',
          error: 'Graph extraction prompt not found',
        },
      );
      throw new Error('Graph extraction prompt not found');
    }

    // Get AI provider
    const aiProvider = await this.getAiProvider(
      resolvedConfig.aiProviderId,
      datasetId,
    );

    // Create LLM client
    const llmClient = this.llmClientFactory.createClient(aiProvider);

    let totalNodesCreated = 0;
    let totalEdgesCreated = 0;

    // Process segments individually to maintain segment-specific linking
    this.logger.log(
      `Processing ${segments.length} segments individually for segment-specific linking`,
    );

    // Process each segment individually
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const segment = segments[segmentIndex];
      this.logger.log(
        `Processing segment ${segmentIndex + 1}/${segments.length}: ${segment.id}`,
      );

      try {
        const result = await this.processSingleSegment(
          segment,
          datasetId,
          documentId,
          userId,
          prompt,
          llmClient,
          resolvedConfig,
        );
        totalNodesCreated += result.nodesCreated;
        totalEdgesCreated += result.edgesCreated;

        // Send progress notification
        this.notificationService.sendGraphExtractionUpdate(
          datasetId,
          documentId,
          {
            stage: 'processing_segment',
            segmentIndex: segmentIndex + 1,
            totalSegments: segments.length,
            segmentIds: [segment.id],
            message: `Processed segment ${segmentIndex + 1}/${segments.length}`,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error processing segment ${segmentIndex + 1}:`,
          error,
        );
        this.notificationService.sendGraphExtractionUpdate(
          datasetId,
          documentId,
          {
            stage: 'error',
            segmentIds: [segment.id],
            message: `Error processing segment ${segmentIndex + 1}: ${error.message}`,
            error: error.message,
          },
        );
        // Continue with next segment instead of failing completely
        continue;
      }
    }

    this.logger.log(
      `Graph extraction completed: ${totalNodesCreated} nodes, ${totalEdgesCreated} edges created`,
    );

    // Send completion notification
    this.logger.log(
      `📢 Sending completion notification for ${segmentIds.length} segments: ${segmentIds.join(', ')}`,
    );
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'completed',
      segmentIds: segmentIds,
      nodesCreated: totalNodesCreated,
      edgesCreated: totalEdgesCreated,
      message: `Graph extraction completed: ${totalNodesCreated} nodes, ${totalEdgesCreated} edges created`,
    });
    this.logger.log(`✅ Completion notification sent for dataset ${datasetId}`);

    return { nodesCreated: totalNodesCreated, edgesCreated: totalEdgesCreated };
  }

  private async processSingleSegment(
    segment: DocumentSegment,
    datasetId: string,
    documentId: string,
    userId: string,
    prompt: Prompt,
    llmClient: any,
    config: CreateGraphExtractionConfigDto,
  ): Promise<{ nodesCreated: number; edgesCreated: number }> {
    this.logger.log(`🔄 Processing single segment: ${segment.id}`);

    try {
      // Update segment status to processing
      await this.segmentRepository.update(segment.id, {
        graphExtractionStatus: 'processing',
      });

      // Send processing notification
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'processing_segment',
          segmentIndex: 0,
          totalSegments: 1,
          message: `Processing segment ${segment.id}`,
        },
      );

      // Load dataset to check settings
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
      });

      // Check if hybrid extraction is enabled
      const useHybridExtraction =
        dataset?.settings?.graph_settings?.useHybridExtraction || false;
      const entityMatchingThreshold =
        dataset?.settings?.graph_settings?.entityMatchingThreshold || 0.7;

      let extractionResult: ExtractionResult | null = null;
      let matchedEntities: any[] = [];

      if (useHybridExtraction) {
        this.logger.log(`🔄 Using hybrid extraction for segment ${segment.id}`);

        // Process with hybrid extraction
        const hybridResult =
          await this.hybridExtractionService.processSegmentWithHybridExtraction(
            segment,
            datasetId,
            config,
            prompt,
            entityMatchingThreshold,
          );

        matchedEntities = hybridResult.preprocessedContent.matchedEntities;

        // Send LLM call notification
        this.notificationService.sendGraphExtractionUpdate(
          datasetId,
          documentId,
          {
            stage: 'llm_call',
            message: `Calling LLM for hybrid graph extraction with ${matchedEntities.length} matched entities`,
          },
        );

        // Call LLM with constrained prompt
        extractionResult = await this.callLLMForExtraction(
          hybridResult.constrainedPrompt,
          prompt,
          llmClient,
          hybridResult.extractionConfig,
        );
      } else {
        // Prepare content for LLM (original approach)
        const metadata = {
          platform: segment.document?.dataSourceType || 'unknown',
          author: segment.document?.name || 'unknown',
          date: segment.createdAt?.toISOString() || new Date().toISOString(),
          engagement: 'unknown', // This would come from CSV data
        };

        const content = `**Post:**\n${segment.content}\n**Metadata:** ${JSON.stringify(metadata)}\n`;

        // Send LLM call notification
        this.notificationService.sendGraphExtractionUpdate(
          datasetId,
          documentId,
          {
            stage: 'llm_call',
            message: `Calling LLM for graph extraction`,
          },
        );

        // Call LLM for extraction
        extractionResult = await this.callLLMForExtraction(
          content,
          prompt,
          llmClient,
          config,
        );
      }

      if (!extractionResult) {
        this.logger.warn('❌ No extraction result from LLM');

        // Update segment status to error
        await this.segmentRepository.update(segment.id, {
          graphExtractionStatus: 'error',
        });

        this.notificationService.sendGraphExtractionUpdate(
          datasetId,
          documentId,
          {
            stage: 'error',
            message: 'No extraction result from LLM',
            error: 'No extraction result from LLM',
          },
        );
        return { nodesCreated: 0, edgesCreated: 0 };
      }

      this.logger.log(
        `✅ Got extraction result: ${extractionResult.nodes.length} nodes, ${extractionResult.edges.length} edges`,
      );

      // Process and save nodes - now properly linked to this specific segment
      this.logger.log(
        `🔄 Processing ${extractionResult.nodes.length} nodes...`,
      );
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'creating_nodes',
          message: `Creating ${extractionResult.nodes.length} nodes`,
        },
      );

      const nodes = await this.processAndSaveNodesForSegment(
        extractionResult.nodes,
        segment,
        datasetId,
        documentId,
        userId,
        config,
      );

      // Process and save edges
      this.logger.log(
        `🔄 Processing ${extractionResult.edges.length} edges...`,
      );
      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'creating_edges',
          message: `Creating ${extractionResult.edges.length} edges`,
        },
      );

      const edges = await this.processAndSaveEdges(
        extractionResult.edges,
        nodes,
        datasetId,
        userId,
      );
      this.logger.log(`✅ Created ${edges.length} edges`);

      // Post-processing: Normalization and Learning
      try {
        // Real-time normalization if enabled
        const autoNormalization =
          dataset?.settings?.graph_settings?.autoNormalization || false;
        if (autoNormalization) {
          this.logger.log(
            `🔄 Running real-time normalization for document ${documentId}`,
          );
          await this.entityNormalizationService.normalizeAfterExtraction(
            documentId,
          );
        }

        // Continuous learning if enabled
        const continuousLearning =
          dataset?.settings?.graph_settings?.continuousLearning || false;
        if (continuousLearning) {
          this.logger.log(
            `🔄 Updating entity dictionary from extraction results`,
          );

          // Update entity usage from hybrid extraction
          if (useHybridExtraction && matchedEntities.length > 0) {
            await this.hybridExtractionService.updateEntityUsageFromExtraction(
              extractionResult,
              matchedEntities,
              datasetId,
            );
          }

          // Learn from extraction results
          await this.entityLearningService.learnFromExtraction(
            extractionResult,
            datasetId,
          );
        }
      } catch (postProcessingError) {
        this.logger.warn(
          `Post-processing error (non-fatal): ${postProcessingError.message}`,
        );
        // Don't fail the extraction for post-processing errors
      }

      // Update segment status to completed
      await this.segmentRepository.update(segment.id, {
        graphExtractionStatus: 'completed',
      });

      return { nodesCreated: nodes.length, edgesCreated: edges.length };
    } catch (error) {
      this.logger.error(`Error processing segment ${segment.id}:`, error);

      // Update segment status to error
      await this.segmentRepository.update(segment.id, {
        graphExtractionStatus: 'error',
      });

      this.notificationService.sendGraphExtractionUpdate(
        datasetId,
        documentId,
        {
          stage: 'error',
          message: `Error processing segment: ${error.message}`,
          error: error.message,
        },
      );

      return { nodesCreated: 0, edgesCreated: 0 };
    }
  }

  private async processAndSaveNodesForSegment(
    extractedNodes: ExtractedNode[],
    segment: DocumentSegment,
    datasetId: string,
    documentId: string,
    userId: string,
    config: CreateGraphExtractionConfigDto,
  ): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];

    for (const extractedNode of extractedNodes) {
      // Check for duplicates if deduplication is enabled
      if (config.enableDeduplication) {
        const normalizedName = extractedNode.properties?.normalized_name;

        // First try exact label match
        let existingNodes = await this.nodeRepository.find({
          where: {
            datasetId,
            nodeType: extractedNode.type,
            label: extractedNode.label,
          },
        });

        // If no exact match and we have a normalized name, try normalized name matching
        if (existingNodes.length === 0 && normalizedName) {
          existingNodes = await this.nodeRepository
            .createQueryBuilder('node')
            .where('node.datasetId = :datasetId', { datasetId })
            .andWhere('node.nodeType = :nodeType', {
              nodeType: extractedNode.type,
            })
            .andWhere('node.properties->>:normalizedName = :normalizedName', {
              normalizedName: 'normalized_name',
              normalizedNameValue: normalizedName,
            })
            .getMany();
        }

        // If still no match, try fuzzy matching on normalized names
        if (existingNodes.length === 0 && normalizedName) {
          const allNodesOfType = await this.nodeRepository.find({
            where: {
              datasetId,
              nodeType: extractedNode.type,
            },
          });

          // Find nodes with similar normalized names (case-insensitive, trimmed)
          existingNodes = allNodesOfType.filter((node) => {
            const nodeNormalizedName = node.properties?.normalized_name;
            if (!nodeNormalizedName) return false;

            return (
              nodeNormalizedName.toLowerCase().trim() ===
              normalizedName.toLowerCase().trim()
            );
          });
        }

        if (existingNodes.length > 0) {
          // Merge with existing node
          const existingNode = existingNodes[0];

          // Also try to normalize the existing node if not already normalized
          let normalizedEntityId = existingNode.properties?.graphEntityId;
          let normalizedCanonicalName =
            existingNode.properties?.normalizedCanonicalName;

          if (!normalizedEntityId) {
            try {
              const entityMatches =
                await this.entityDictionaryService.findMatchingEntities(
                  existingNode.label,
                  0.85,
                );
              const filteredMatches = existingNode.nodeType
                ? entityMatches.filter(
                    (match: any) =>
                      match.entity.entityType.toLowerCase() ===
                      existingNode.nodeType.toLowerCase(),
                  )
                : entityMatches;

              if (filteredMatches.length > 0) {
                normalizedEntityId = filteredMatches[0].entity.id;
                normalizedCanonicalName =
                  filteredMatches[0].entity.canonicalName;
              }
            } catch {
              // Ignore normalization errors for existing nodes
            }
          }

          const mergedProperties = {
            ...existingNode.properties,
            ...extractedNode.properties,
            // Ensure we keep the best normalized name
            normalized_name:
              normalizedName || existingNode.properties?.normalized_name,
            ...(normalizedEntityId && {
              graphEntityId: normalizedEntityId,
              normalizedCanonicalName: normalizedCanonicalName,
            }),
          };

          await this.nodeRepository.update(existingNode.id, {
            properties: mergedProperties,
          });

          this.logger.log(
            `🔄 Merged duplicate node: "${extractedNode.label}" (normalized: "${normalizedName}") with existing node "${existingNode.label}"`,
          );

          nodes.push(existingNode);
          continue;
        }
      }

      // Normalize node with graph entity if available
      let normalizedEntityId: string | undefined;
      let normalizedCanonicalName: string | undefined;

      try {
        // Try to find matching graph entity by canonical name or aliases
        const entityMatches =
          await this.entityDictionaryService.findMatchingEntities(
            extractedNode.label,
            0.85, // High threshold for matching
          );

        // Filter matches by entity type if specified
        const filteredMatches = extractedNode.type
          ? entityMatches.filter(
              (match: any) =>
                match.entity.entityType.toLowerCase() ===
                extractedNode.type.toLowerCase(),
            )
          : entityMatches;

        if (filteredMatches.length > 0) {
          const bestMatch = filteredMatches[0];
          normalizedEntityId = bestMatch.entity.id;
          normalizedCanonicalName = bestMatch.entity.canonicalName;

          // If similarity > 90% and node label differs from canonical name, add/update alias
          if (
            bestMatch.similarity > 0.9 &&
            extractedNode.label.toLowerCase() !==
              bestMatch.entity.canonicalName.toLowerCase()
          ) {
            try {
              await this.entityLearningService.addAliasIfNotExists(
                bestMatch.entity.id,
                extractedNode.label,
              );
              this.logger.log(
                `📝 Added/updated alias "${extractedNode.label}" for entity "${bestMatch.entity.canonicalName}" (similarity: ${bestMatch.similarity.toFixed(2)})`,
              );
            } catch (aliasError) {
              this.logger.warn(
                `Failed to add alias "${extractedNode.label}" for entity "${bestMatch.entity.canonicalName}": ${aliasError.message}`,
              );
            }
          }

          this.logger.log(
            `🔗 Normalized node "${extractedNode.label}" to graph entity "${bestMatch.entity.canonicalName}" (similarity: ${bestMatch.similarity.toFixed(2)})`,
          );
        } else {
          // No match found - auto-create entity if confidence is high enough
          const nodeConfidence = extractedNode.properties?.confidence || 0.8;
          if (nodeConfidence >= 0.7) {
            try {
              const newEntity = await this.entityDictionaryService.addEntity(
                userId,
                {
                  entityType: extractedNode.type,
                  canonicalName: extractedNode.label,
                  confidenceScore: nodeConfidence,
                  source: EntitySource.AUTO_DISCOVERED,
                  metadata: {
                    learned_from: 'extraction',
                    confidence: nodeConfidence,
                    first_seen: new Date(),
                    extraction_patterns: [extractedNode.label],
                  },
                },
              );
              normalizedEntityId = newEntity.id;
              normalizedCanonicalName = newEntity.canonicalName;

              this.logger.log(
                `✨ Auto-created new graph entity "${extractedNode.label}" (type: ${extractedNode.type}, confidence: ${nodeConfidence.toFixed(2)})`,
              );
            } catch (createError) {
              // Entity might already exist (race condition), try to find it
              try {
                const existingEntity =
                  await this.entityDictionaryService.findEntities({
                    entityType: extractedNode.type,
                    searchTerm: extractedNode.label,
                    limit: 1,
                  });
                if (existingEntity.entities.length > 0) {
                  normalizedEntityId = existingEntity.entities[0].id;
                  normalizedCanonicalName =
                    existingEntity.entities[0].canonicalName;
                  this.logger.log(
                    `🔗 Found existing entity "${normalizedCanonicalName}" after creation attempt`,
                  );
                }
              } catch {
                this.logger.warn(
                  `Failed to auto-create entity "${extractedNode.label}": ${createError.message}`,
                );
              }
            }
          }
        }
      } catch (normalizationError) {
        // Non-fatal: continue with node creation even if normalization fails
        this.logger.warn(
          `Failed to normalize node "${extractedNode.label}" with graph entity: ${normalizationError.message}`,
        );
      }

      // Create new node - properly linked to this specific segment
      const nodeProperties = {
        ...extractedNode.properties,
        ...(normalizedEntityId && {
          graphEntityId: normalizedEntityId,
          normalizedCanonicalName: normalizedCanonicalName,
        }),
      };

      const node = this.nodeRepository.create({
        datasetId,
        documentId,
        segmentId: segment.id, // Link to the specific segment
        nodeType: extractedNode.type,
        label: extractedNode.label,
        properties: nodeProperties,
        userId,
      });

      const savedNode = await this.nodeRepository.save(node);
      nodes.push(savedNode);
    }

    return nodes;
  }

  private async callLLMForExtraction(
    segmentContent: string,
    prompt: Prompt,
    llmClient: any,
    config: CreateGraphExtractionConfigDto,
  ): Promise<ExtractionResult | null> {
    try {
      // Get AI provider for the extraction config
      const aiProvider = await this.aiProviderService.findOne({
        where: { id: config.aiProviderId },
      });

      if (!aiProvider) {
        throw new Error(`AI Provider with ID ${config.aiProviderId} not found`);
      }

      // Build template variables for graph extraction
      const templateVariables = {
        platform: 'Document',
        author: 'Document Author',
        date: new Date().toISOString(),
        engagement: 'N/A',
      };

      // Use shared LLM extraction service
      const extractionResult =
        await this.llmExtractionService.extractWithLLM<any>(
          {
            prompt,
            aiProvider,
            model: config.model || '',
            temperature: config.temperature,
            content: segmentContent,
            templateVariables,
          },
          llmClient,
          {
            allowTextFallback: true,
            allowArrays: true,
            textParser: (content) => this.parseStructuredTextToJson(content),
          },
        );

      if (!extractionResult.success || !extractionResult.data) {
        this.logger.warn(
          `LLM extraction failed: ${extractionResult.error || 'Unknown error'}`,
        );
        return null;
      }

      const parsed = extractionResult.data;

      // Handle different response formats: entities/relationships vs nodes/edges
      // Transform entities/relationships format to nodes/edges format if needed
      // Only transform if nodes/edges don't already exist
      if (
        parsed.entities &&
        Array.isArray(parsed.entities) &&
        (!parsed.nodes ||
          !Array.isArray(parsed.nodes) ||
          parsed.nodes.length === 0)
      ) {
        this.logger.log(
          `🔄 Detected entities format (${parsed.entities.length} entities), transforming to nodes format`,
        );
        parsed.nodes = parsed.entities
          .map((entity: any) => {
            const nodeType = entity.entityType || entity.type || 'entity';
            const label = entity.canonicalName || entity.name || entity.label;
            const id = entity.entityId || entity.id;

            if (!label) {
              this.logger.warn(
                `Entity has no valid label, skipping: ${JSON.stringify(entity)}`,
              );
              return null;
            }

            return {
              type: nodeType,
              label: label,
              id: id,
              properties: {
                ...entity.properties,
                aliases: entity.aliases || [],
                confidence: entity.confidence,
                original_entityId: entity.entityId,
                original_entityType: entity.entityType,
              },
            };
          })
          .filter((node: any) => node !== null);

        this.logger.log(
          `✅ Transformed ${parsed.nodes.length} entities to nodes`,
        );
      }

      if (
        parsed.relationships &&
        Array.isArray(parsed.relationships) &&
        (!parsed.edges ||
          !Array.isArray(parsed.edges) ||
          parsed.edges.length === 0)
      ) {
        this.logger.log(
          `🔄 Detected relationships format (${parsed.relationships.length} relationships), transforming to edges format`,
        );

        // Create a map of entityId to label for quick lookup
        const entityMap = new Map<string, string>();
        if (parsed.entities && Array.isArray(parsed.entities)) {
          parsed.entities.forEach((entity: any) => {
            const entityId = entity.entityId || entity.id;
            const label = entity.canonicalName || entity.name || entity.label;
            if (entityId && label) {
              entityMap.set(entityId, label);
            }
          });
        }

        parsed.edges = parsed.relationships.map((rel: any) => {
          // Try to get labels from entity map first, then fall back to direct values
          const sourceEntityId = rel.sourceEntityId || rel.source;
          const targetEntityId = rel.targetEntityId || rel.target;

          const sourceLabel =
            entityMap.get(sourceEntityId) ||
            rel.sourceNodeLabel ||
            rel.source ||
            rel.from ||
            sourceEntityId;

          const targetLabel =
            entityMap.get(targetEntityId) ||
            rel.targetNodeLabel ||
            rel.target ||
            rel.to ||
            targetEntityId;

          return {
            type:
              rel.relationshipType || rel.type || rel.edgeType || rel.relation,
            source: sourceLabel,
            target: targetLabel,
            sourceNodeLabel: sourceLabel,
            targetNodeLabel: targetLabel,
            properties: {
              ...rel.properties,
              confidence: rel.confidence,
              source: rel.source,
              original_relationshipType: rel.relationshipType,
              original_sourceEntityId: sourceEntityId,
              original_targetEntityId: targetEntityId,
            },
          };
        });
      }

      // Log the successful extraction result
      this.logger.log(
        `✅ Successfully extracted ${parsed.nodes?.length || 0} nodes and ${parsed.edges?.length || 0} edges`,
      );

      // Transform the LLM response to match our expected format
      const transformedResult: ExtractionResult = {
        nodes: Array.isArray(parsed.nodes)
          ? parsed.nodes
              .map((node: any, index: number) => {
                const nodeType = this.mapNodeType(node.type);
                const label = (node.label || node.id || node.name)?.trim();

                if (!label) {
                  this.logger.warn(
                    `Node ${index + 1} has no valid label (label: "${node.label}", id: "${node.id}", name: "${node.name}"), skipping`,
                  );
                  return null;
                }

                this.logger.log(
                  `🔄 Processing node: original_type="${node.type}", label="${label}", mapped_type="${nodeType}"`,
                );

                return {
                  type: nodeType,
                  label: label,
                  properties: {
                    ...node.properties,
                    // Map any additional fields from the LLM response
                    original_id: node.id,
                    original_type: node.type,
                  },
                };
              })
              .filter((node: any) => node !== null)
          : [],
        edges: Array.isArray(parsed.edges)
          ? parsed.edges
              .map((edge: any, index: number) => {
                const sourceLabel = (
                  edge.from ||
                  edge.sourceNodeLabel ||
                  edge.source ||
                  edge.sourceNode
                )?.trim();
                const targetLabel = (
                  edge.to ||
                  edge.targetNodeLabel ||
                  edge.target ||
                  edge.targetNode
                )?.trim();
                const edgeType = this.mapEdgeType(
                  edge.type || edge.edgeType || edge.relation,
                );

                if (!sourceLabel || !targetLabel) {
                  this.logger.warn(
                    `Edge ${index + 1} has invalid labels (source: "${sourceLabel}", target: "${targetLabel}"), skipping`,
                  );
                  return null;
                }

                this.logger.log(
                  `🔄 Processing edge: original_type="${edge.type || edge.edgeType || edge.relation}", source="${sourceLabel}", target="${targetLabel}", mapped_type="${edgeType}"`,
                );

                return {
                  sourceNodeLabel: sourceLabel,
                  targetNodeLabel: targetLabel,
                  edgeType: edgeType,
                  weight: edge.weight || 1,
                  properties: {
                    ...edge.properties,
                    // Map any additional fields from the LLM response
                    original_type: edge.type || edge.edgeType || edge.relation,
                  },
                };
              })
              .filter((edge: any) => edge !== null)
          : [],
      };

      this.logger.log(
        `🔄 Transformed ${transformedResult.nodes.length} nodes and ${transformedResult.edges.length} edges`,
      );

      return transformedResult;
    } catch (error) {
      this.logger.error('Error calling LLM for extraction:', error);
      return null;
    }
  }

  private async processAndSaveEdges(
    extractedEdges: ExtractedEdge[],
    nodes: GraphNode[],
    datasetId: string,
    userId: string,
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const nodeMap = new Map(nodes.map((node) => [node.label, node]));

    this.logger.log(
      `🔄 Processing ${extractedEdges.length} extracted edges...`,
    );

    for (const extractedEdge of extractedEdges) {
      const sourceNode = nodeMap.get(extractedEdge.sourceNodeLabel);
      const targetNode = nodeMap.get(extractedEdge.targetNodeLabel);

      if (!sourceNode || !targetNode) {
        this.logger.warn(
          `Source or target node not found for edge: ${extractedEdge.sourceNodeLabel} -> ${extractedEdge.targetNodeLabel}`,
        );
        continue;
      }

      // Check for duplicate edges
      const existingEdge = await this.edgeRepository.findOne({
        where: {
          datasetId,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          edgeType: extractedEdge.edgeType,
        },
      });

      if (existingEdge) {
        // Update existing edge
        await this.edgeRepository.update(existingEdge.id, {
          weight: extractedEdge.weight || 1.0,
          properties: {
            ...existingEdge.properties,
            ...extractedEdge.properties,
          },
        });
        edges.push(existingEdge);
        continue;
      }

      // Create new edge
      const edge = this.edgeRepository.create({
        datasetId,
        sourceNodeId: sourceNode.id,
        targetNodeId: targetNode.id,
        edgeType: extractedEdge.edgeType,
        weight: extractedEdge.weight || 1.0,
        properties: extractedEdge.properties || {},
        userId,
      });

      const savedEdge = await this.edgeRepository.save(edge);
      edges.push(savedEdge);
    }

    return edges;
  }

  private async getExtractionPrompt(
    promptId?: string,
    datasetId?: string,
    documentId?: string,
  ): Promise<Prompt | null> {
    if (promptId) {
      try {
        return await this.promptService.findPromptById(promptId);
      } catch (error) {
        this.logger.error(`Error looking up prompt by ID: ${error.message}`);
        throw error;
      }
    }

    // Use prompt selector to get appropriate prompt based on dataset and document type
    if (datasetId) {
      try {
        return await this.graphPromptSelectorService.selectPrompt(
          datasetId,
          documentId,
        );
      } catch (error) {
        this.logger.error(`Error selecting prompt: ${error.message}`);
        // Fall back to default prompt
      }
    }

    // Fallback to default graph extraction prompt
    return await this.promptRepository.findOne({
      where: {
        name: 'Document Graph Extraction',
        isActive: true,
      },
    });
  }

  private async getAiProvider(
    providerId?: string,
    datasetId?: string,
  ): Promise<any> {
    if (providerId) {
      try {
        const provider =
          await this.aiProviderService.findAiProviderById(providerId);
        if (provider) {
          return provider;
        }
      } catch (error) {
        this.logger.error(
          `Error looking up AI provider by ID ${providerId}: ${error.message}`,
        );
      }
    }

    // If no provider ID provided, try to get from dataset settings
    if (datasetId) {
      const dataset = await this.datasetRepository.findOne({
        where: { id: datasetId },
        select: ['settings'],
      });

      if (dataset?.settings?.graph_settings?.aiProviderId) {
        const providerValue = dataset.settings.graph_settings.aiProviderId;

        // Check if it's a UUID (provider ID) or a string (provider type/name)
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            providerValue,
          );

        if (isUuid) {
          const provider =
            await this.aiProviderService.findAiProviderById(providerValue);
          if (provider) {
            return provider;
          }
        } else {
          const provider = await this.aiProviderService.findAiProviderByType(
            providerValue,
            '72287e07-967e-4de6-88b0-ff8c16f43991', // Default user ID for now
          );

          if (provider) {
            return provider;
          }
        }
      }
    }

    // No fallback - fail if provider not found
    throw new Error(
      `No AI provider found. Provider ID: ${providerId}, Dataset ID: ${datasetId}. Please check your configuration.`,
    );
  }

  private mapNodeType(nodeType: string): NodeType {
    if (!nodeType || typeof nodeType !== 'string') {
      this.logger.warn(
        `Invalid node type: ${nodeType}, defaulting to ORGANIZATION`,
      );
      return NodeType.ORGANIZATION;
    }

    // Map LLM response node types to our enum values
    const nodeTypeMap: Record<string, NodeType> = {
      author: NodeType.AUTHOR,
      brand: NodeType.BRAND,
      topic: NodeType.TOPIC,
      hashtag: NodeType.HASHTAG,
      influencer: NodeType.INFLUENCER,
      location: NodeType.LOCATION,
      organization: NodeType.ORGANIZATION,
      product: NodeType.PRODUCT,
      event: NodeType.EVENT,
      service: NodeType.ORGANIZATION, // Map service to organization
      credit_card: NodeType.PRODUCT, // Map credit_card to product
      person: NodeType.AUTHOR, // Map person to author
      company: NodeType.ORGANIZATION, // Map company to organization
      place: NodeType.LOCATION, // Map place to location
      subject: NodeType.TOPIC, // Map subject to topic
      theme: NodeType.TOPIC, // Map theme to topic
      concept: NodeType.TOPIC, // Map concept to topic
    };

    const normalizedType = nodeType.toLowerCase().trim();
    const mappedType = nodeTypeMap[normalizedType];

    if (!mappedType) {
      this.logger.warn(
        `Unknown node type: ${nodeType}, defaulting to ORGANIZATION`,
      );
      return NodeType.ORGANIZATION;
    }

    return mappedType;
  }

  private mapEdgeType(edgeType: string): EdgeType {
    if (!edgeType || typeof edgeType !== 'string') {
      this.logger.warn(
        `Invalid edge type: ${edgeType}, defaulting to RELATED_TO`,
      );
      return EdgeType.RELATED_TO;
    }

    // Map LLM response edge types to our enum values
    const edgeTypeMap: Record<string, EdgeType> = {
      mentions: EdgeType.MENTIONS,
      sentiment: EdgeType.SENTIMENT,
      interacts_with: EdgeType.INTERACTS_WITH,
      competes_with: EdgeType.COMPETES_WITH,
      discusses: EdgeType.DISCUSSES,
      shares_topic: EdgeType.SHARES_TOPIC,
      follows: EdgeType.FOLLOWS,
      collaborates: EdgeType.COLLABORATES,
      influences: EdgeType.INFLUENCES,
      located_in: EdgeType.LOCATED_IN,
      part_of: EdgeType.PART_OF,
      related_to: EdgeType.RELATED_TO,
      offers: EdgeType.RELATED_TO, // Map offers to related_to
      used_for: EdgeType.RELATED_TO, // Map used_for to related_to
      uses_hashtag: EdgeType.RELATED_TO, // Map uses_hashtag to related_to
      connects: EdgeType.RELATED_TO, // Map connects to related_to
      links: EdgeType.RELATED_TO, // Map links to related_to
      associates: EdgeType.RELATED_TO, // Map associates to related_to
      involves: EdgeType.RELATED_TO, // Map involves to related_to
      contains: EdgeType.RELATED_TO, // Map contains to related_to
      includes: EdgeType.RELATED_TO, // Map includes to related_to
    };

    const normalizedType = edgeType.toLowerCase().trim();
    const mappedType = edgeTypeMap[normalizedType];

    if (!mappedType) {
      this.logger.warn(
        `Unknown edge type: ${edgeType}, defaulting to RELATED_TO`,
      );
      return EdgeType.RELATED_TO;
    }

    return mappedType;
  }

  private parseStructuredTextToJson(content: string): any {
    try {
      const nodes: any[] = [];
      const edges: any[] = [];

      // Extract entities from the structured text
      const lines = content.split('\n');
      let currentSection = '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Detect sections
        if (
          trimmedLine.includes('**Entities:**') ||
          trimmedLine.includes('**Banks and Financial Institutions:**')
        ) {
          currentSection = 'entities';
          continue;
        } else if (trimmedLine.includes('**Products and Services:**')) {
          currentSection = 'products';
          continue;
        } else if (trimmedLine.includes('**Relationships:**')) {
          currentSection = 'relationships';
          continue;
        } else if (trimmedLine.includes('**Interactions:**')) {
          currentSection = 'interactions';
          continue;
        } else if (trimmedLine.includes('**Users:**')) {
          currentSection = 'users';
          continue;
        } else if (trimmedLine.includes('**Posts:**')) {
          currentSection = 'posts';
          continue;
        }

        // Parse entity lines
        if (currentSection === 'entities' || currentSection === 'products') {
          const entityMatch = trimmedLine.match(
            /^\s*\*\s*(.+?)(?:\s*\((.+?)\))?\s*$/,
          );
          if (entityMatch) {
            const label = entityMatch[1].trim();
            const description = entityMatch[2]?.trim();

            if (label && !label.includes('**')) {
              nodes.push({
                type:
                  currentSection === 'entities' ? 'organization' : 'product',
                label: label,
                properties: {
                  description: description,
                  confidence: 0.8, // Default confidence for parsed entities
                },
              });
            }
          }
        }

        // Parse relationship lines
        if (currentSection === 'relationships') {
          const relationshipMatch = trimmedLine.match(
            /^\s*\*\s*(.+?)\s*\((.+?)\)\s*$/,
          );
          if (relationshipMatch) {
            const entities = relationshipMatch[1]
              .split(',')
              .map((e) => e.trim());
            const relationship = relationshipMatch[2].trim();

            // Create edges between entities
            for (let i = 0; i < entities.length - 1; i++) {
              for (let j = i + 1; j < entities.length; j++) {
                edges.push({
                  from: entities[i],
                  to: entities[j],
                  type: 'related_to',
                  properties: {
                    context: relationship,
                    confidence: 0.7,
                  },
                });
              }
            }
          }
        }
      }

      // If we found entities but no relationships, create some basic relationships
      if (nodes.length > 0 && edges.length === 0) {
        // Group nodes by type
        const organizations = nodes.filter((n) => n.type === 'organization');
        const products = nodes.filter((n) => n.type === 'product');

        // Create relationships between organizations
        for (let i = 0; i < organizations.length - 1; i++) {
          for (let j = i + 1; j < organizations.length; j++) {
            edges.push({
              from: organizations[i].label,
              to: organizations[j].label,
              type: 'competes_with',
              properties: {
                context: 'Financial services comparison',
                confidence: 0.6,
              },
            });
          }
        }

        // Create relationships between organizations and products
        organizations.forEach((org) => {
          products.forEach((product) => {
            edges.push({
              from: org.label,
              to: product.label,
              type: 'offers',
              properties: {
                context: 'Financial product offering',
                confidence: 0.5,
              },
            });
          });
        });
      }

      this.logger.log(
        `Parsed structured text: ${nodes.length} nodes, ${edges.length} edges`,
      );

      return {
        nodes,
        edges,
      };
    } catch (error) {
      this.logger.error(`Error parsing structured text: ${error.message}`);
      return null;
    }
  }
}
