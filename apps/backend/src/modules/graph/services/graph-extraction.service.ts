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

    // Resolve settings - always load dataset settings and merge with provided config
    let resolvedConfig: CreateGraphExtractionConfigDto;

    // Always try to load dataset graph settings first
    const dataset = await this.datasetRepository.findOne({
      where: { id: datasetId },
      select: ['settings'],
    });

    this.logger.debug(
      `Dataset settings: ${JSON.stringify(dataset?.settings, null, 2)}`,
    );

    if (dataset?.settings?.graph_settings) {
      // Validate required fields
      if (!dataset.settings.graph_settings.aiProviderId) {
        throw new Error('AI Provider ID is required in dataset graph settings');
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
        'Dataset graph settings not found. Please configure AI provider and model in dataset settings.',
      );
    }

    // Merge with provided config if any
    if (config) {
      resolvedConfig = { ...resolvedConfig, ...config };
      this.logger.debug(
        `Merged with provided config: ${JSON.stringify(resolvedConfig, null, 2)}`,
      );
    }

    this.logger.debug(
      `DatasetId: ${datasetId}, DocumentId: ${documentId}, UserId: ${userId}`,
    );

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
    this.logger.log(
      `🔍 Looking for prompt with ID: ${resolvedConfig.promptId} - DEBUG V2`,
    );
    const prompt = await this.getExtractionPrompt(resolvedConfig.promptId);
    this.logger.log(`📝 Prompt found: ${prompt ? prompt.name : 'null'}`);

    if (prompt) {
      this.logger.debug(`Prompt details:`);
      this.logger.debug(`- ID: ${prompt.id}`);
      this.logger.debug(`- Name: ${prompt.name}`);
      this.logger.debug(`- Type: ${prompt.type}`);
      this.logger.debug(
        `- System prompt length: ${prompt.systemPrompt?.length || 0}`,
      );
      this.logger.debug(
        `- User prompt template length: ${prompt.userPromptTemplate?.length || 0}`,
      );
      this.logger.debug(`- User prompt template: ${prompt.userPromptTemplate}`);
    }

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
    this.logger.log(
      `🔍 Getting AI provider with ID: ${resolvedConfig.aiProviderId}`,
    );
    this.logger.log(`🔍 Dataset ID: ${datasetId}`);
    const aiProvider = await this.getAiProvider(
      resolvedConfig.aiProviderId,
      datasetId,
    );
    this.logger.log(
      `🔍 Retrieved AI Provider: ${JSON.stringify(
        {
          id: aiProvider?.id,
          name: aiProvider?.name,
          type: aiProvider?.type,
          baseUrl: aiProvider?.baseUrl,
          hasApiKey: !!aiProvider?.apiKey,
        },
        null,
        2,
      )}`,
    );

    this.logger.debug(
      `🔍 Retrieved AI Provider: ${JSON.stringify(
        {
          id: aiProvider?.id,
          name: aiProvider?.name,
          type: aiProvider?.type,
          baseUrl: aiProvider?.baseUrl,
          hasApiKey: !!aiProvider?.apiKey,
        },
        null,
        2,
      )}`,
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
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'completed',
      segmentIds: segmentIds,
      nodesCreated: totalNodesCreated,
      edgesCreated: totalEdgesCreated,
      message: `Graph extraction completed: ${totalNodesCreated} nodes, ${totalEdgesCreated} edges created`,
    });

    return { nodesCreated: totalNodesCreated, edgesCreated: totalEdgesCreated };
  }

  private async processBatch(
    segments: DocumentSegment[],
    datasetId: string,
    documentId: string,
    userId: string,
    prompt: Prompt,
    llmClient: any,
    config: CreateGraphExtractionConfigDto,
  ): Promise<{ nodesCreated: number; edgesCreated: number }> {
    this.logger.log(`🔄 Processing batch of ${segments.length} segments`);

    // Send processing notification
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'processing_segment',
      segmentIndex: 0,
      totalSegments: segments.length,
      message: `Processing ${segments.length} segments`,
    });

    // Prepare content for LLM
    const content = segments
      .map((segment, index) => {
        const metadata = {
          platform: segment.document?.dataSourceType || 'unknown',
          author: segment.document?.name || 'unknown',
          date: segment.createdAt?.toISOString() || new Date().toISOString(),
          engagement: 'unknown', // This would come from CSV data
        };

        return `**Post ${index + 1}:**\n${segment.content}\n**Metadata:** ${JSON.stringify(metadata)}\n`;
      })
      .join('\n---\n');

    this.logger.debug(`Content length: ${content.length} characters`);
    this.logger.debug(`First 200 chars: ${content.substring(0, 200)}...`);
    this.logger.debug(`Full content: ${content}`);

    // Send LLM call notification
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'llm_call',
      message: `Calling LLM for graph extraction`,
    });

    // Call LLM for extraction
    const extractionResult = await this.callLLMForExtraction(
      content,
      prompt,
      llmClient,
      config,
    );

    if (!extractionResult) {
      this.logger.warn('❌ No extraction result from LLM');
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

    // Process and save nodes
    this.logger.log(`🔄 Processing ${extractionResult.nodes.length} nodes...`);
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'creating_nodes',
      message: `Creating ${extractionResult.nodes.length} nodes`,
    });

    const nodes = await this.processAndSaveNodes(
      extractionResult.nodes,
      segments,
      datasetId,
      documentId,
      userId,
      config,
    );
    this.logger.log(`✅ Created ${nodes.length} nodes`);

    // Process and save edges
    this.logger.log(`🔄 Processing ${extractionResult.edges.length} edges...`);
    this.notificationService.sendGraphExtractionUpdate(datasetId, documentId, {
      stage: 'creating_edges',
      message: `Creating ${extractionResult.edges.length} edges`,
    });

    const edges = await this.processAndSaveEdges(
      extractionResult.edges,
      nodes,
      datasetId,
      userId,
    );
    this.logger.log(`✅ Created ${edges.length} edges`);

    return { nodesCreated: nodes.length, edgesCreated: edges.length };
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

      // Prepare content for LLM
      const metadata = {
        platform: segment.document?.dataSourceType || 'unknown',
        author: segment.document?.name || 'unknown',
        date: segment.createdAt?.toISOString() || new Date().toISOString(),
        engagement: 'unknown', // This would come from CSV data
      };

      const content = `**Post:**\n${segment.content}\n**Metadata:** ${JSON.stringify(metadata)}\n`;

      this.logger.debug(`Content length: ${content.length} characters`);
      this.logger.debug(`First 200 chars: ${content.substring(0, 200)}...`);

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
      const extractionResult = await this.callLLMForExtraction(
        content,
        prompt,
        llmClient,
        config,
      );

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
        const existingNodes = await this.nodeRepository.find({
          where: {
            datasetId,
            nodeType: extractedNode.type,
            label: extractedNode.label,
          },
        });

        if (existingNodes.length > 0) {
          // Merge with existing node
          const existingNode = existingNodes[0];
          const mergedProperties = {
            ...existingNode.properties,
            ...extractedNode.properties,
          };

          await this.nodeRepository.update(existingNode.id, {
            properties: mergedProperties,
          });

          nodes.push(existingNode);
          continue;
        }
      }

      // Create new node - properly linked to this specific segment
      const node = this.nodeRepository.create({
        datasetId,
        documentId,
        segmentId: segment.id, // Link to the specific segment
        nodeType: extractedNode.type,
        label: extractedNode.label,
        properties: extractedNode.properties || {},
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
      // Build user prompt
      this.logger.debug(
        `Original user prompt template: ${prompt.userPromptTemplate}`,
      );
      this.logger.debug(`Segment content length: ${segmentContent.length}`);
      this.logger.debug(
        `Segment content preview: ${segmentContent.substring(0, 200)}...`,
      );

      const userPrompt =
        prompt.userPromptTemplate
          ?.replace('{{content}}', segmentContent)
          .replace('{{text}}', segmentContent)
          .replace('{{platform}}', 'Social Media')
          .replace('{{author}}', 'Various')
          .replace('{{date}}', new Date().toISOString())
          .replace('{{engagement}}', 'Unknown') || segmentContent;

      this.logger.debug(`Processed user prompt: ${userPrompt}`);
      this.logger.debug(`User prompt length: ${userPrompt.length}`);

      // Call LLM
      this.logger.log(`🤖 Calling LLM with model: ${config.model}`);
      this.logger.log(`🤖 Using AI Provider: ${llmClient.constructor.name}`);
      this.logger.log(`🤖 Config: ${JSON.stringify(config, null, 2)}`);
      this.logger.debug(`System prompt: ${prompt.systemPrompt}`);
      this.logger.debug(`User prompt: ${userPrompt.substring(0, 200)}...`);
      this.logger.debug(`Prompt ID: ${prompt.id}`);
      this.logger.debug(`Prompt name: ${prompt.name}`);
      this.logger.debug(`Prompt type: ${prompt.type}`);
      this.logger.debug(
        `System prompt length: ${prompt.systemPrompt?.length || 0}`,
      );
      this.logger.debug(
        `User prompt template length: ${prompt.userPromptTemplate?.length || 0}`,
      );
      this.logger.debug(
        `JSON Schema: ${JSON.stringify(prompt.jsonSchema, null, 2)}`,
      );

      const messages = [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      this.logger.debug(
        `Request messages: ${JSON.stringify(messages, null, 2)}`,
      );

      this.logger.debug(`Calling LLM with parameters:`);
      this.logger.debug(`- Model: ${config.model}`);
      this.logger.debug(`- Temperature: ${config.temperature || 0.7}`);
      this.logger.debug(`- JSON Schema present: ${!!prompt.jsonSchema}`);
      this.logger.debug(`- Messages count: ${messages.length}`);

      let response: any;
      try {
        response = await llmClient.chatCompletion(
          messages,
          config.model,
          prompt.jsonSchema,
          config.temperature || 0.7,
        );
      } catch (error) {
        this.logger.error(`❌ LLM call failed: ${error.message}`);
        this.logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
        throw error;
      }

      this.logger.log(`✅ LLM response status: ${response.status}`);
      this.logger.debug(
        `LLM response data: ${JSON.stringify(response.data, null, 2)}`,
      );
      this.logger.debug(
        `LLM response headers: ${JSON.stringify(response.headers, null, 2)}`,
      );

      // Parse JSON response
      if (!response.data?.choices?.[0]?.message?.content) {
        this.logger.warn('No valid response from LLM');
        return null;
      }

      const content = response.data.choices[0].message.content;
      this.logger.debug(`Raw LLM response content: ${content}`);
      this.logger.debug(`Response content length: ${content.length}`);
      this.logger.debug(`Response content type: ${typeof content}`);

      // Log the full response object for debugging
      this.logger.debug(
        `🔍 Full LLM Response: ${JSON.stringify(response.data, null, 2)}`,
      );

      // Try to find JSON in the response
      let jsonString = '';

      // First, try to find JSON in markdown code blocks
      const codeBlockMatch = content.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      );
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      } else {
        // Try to find JSON object directly
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonString = jsonMatch[0];
        } else {
          // If no JSON object found, try to find JSON array
          const arrayMatch = content.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            jsonString = arrayMatch[0];
          } else {
            // Try to extract structured data from text and convert to JSON
            this.logger.log(
              'No JSON found, attempting to parse structured text response',
            );
            const structuredData = this.parseStructuredTextToJson(content);
            if (structuredData) {
              jsonString = JSON.stringify(structuredData);
            }
          }
        }
      }

      if (!jsonString) {
        this.logger.warn('No JSON found in LLM response');
        this.logger.debug(`Full response content: ${content}`);
        return null;
      }

      this.logger.debug(`Extracted JSON string: ${jsonString}`);

      let parsed;
      try {
        parsed = JSON.parse(jsonString);
        this.logger.debug(
          `Successfully parsed JSON: ${JSON.stringify(parsed, null, 2)}`,
        );
      } catch (parseError) {
        this.logger.error(`JSON parsing error: ${parseError.message}`);
        this.logger.error(`Failed to parse JSON: ${jsonString}`);
        return null;
      }

      // Validate the parsed JSON structure
      if (!parsed || typeof parsed !== 'object') {
        this.logger.error('Parsed JSON is not an object');
        this.logger.error(`Parsed value: ${JSON.stringify(parsed)}`);
        return null;
      }

      this.logger.debug(`Parsed nodes: ${JSON.stringify(parsed.nodes)}`);
      this.logger.debug(`Parsed edges: ${JSON.stringify(parsed.edges)}`);

      // Log the successful extraction result
      this.logger.log(
        `✅ Successfully extracted ${parsed.nodes?.length || 0} nodes and ${parsed.edges?.length || 0} edges`,
      );
      this.logger.debug(
        `🔍 Extraction Result: ${JSON.stringify(parsed, null, 2)}`,
      );

      // Transform the LLM response to match our expected format
      const transformedResult: ExtractionResult = {
        nodes: Array.isArray(parsed.nodes)
          ? parsed.nodes.map((node: any) => ({
              type: this.mapNodeType(node.type),
              label: (node.label || node.id)?.trim() || 'Unknown', // Use label or id as fallback
              properties: {
                ...node.properties,
                // Map any additional fields from the LLM response
                original_id: node.id,
              },
            }))
          : [],
        edges: Array.isArray(parsed.edges)
          ? parsed.edges.map((edge: any) => ({
              sourceNodeLabel:
                (edge.from || edge.sourceNodeLabel || edge.source)?.trim() ||
                'Unknown',
              targetNodeLabel:
                (edge.to || edge.targetNodeLabel || edge.target)?.trim() ||
                'Unknown',
              edgeType: this.mapEdgeType(edge.type || edge.edgeType),
              weight: edge.weight || 1,
              properties: {
                ...edge.properties,
                // Map any additional fields from the LLM response
                original_type: edge.type,
              },
            }))
          : [],
      };

      this.logger.log(
        `🔄 Transformed ${transformedResult.nodes.length} nodes and ${transformedResult.edges.length} edges`,
      );

      // Debug: Log the actual edges being processed
      if (transformedResult.edges.length > 0) {
        this.logger.log(
          `🔍 Found ${transformedResult.edges.length} edges in LLM response`,
        );
        this.logger.debug(
          `Edges to process: ${JSON.stringify(transformedResult.edges, null, 2)}`,
        );
      } else {
        this.logger.warn('⚠️ No edges found in LLM response');
        // Log the raw LLM response to debug
        this.logger.debug(
          `Raw LLM response: ${JSON.stringify(parsed, null, 2)}`,
        );
      }

      return transformedResult;
    } catch (error) {
      this.logger.error('Error calling LLM for extraction:', error);
      return null;
    }
  }

  private async processAndSaveNodes(
    extractedNodes: ExtractedNode[],
    segments: DocumentSegment[],
    datasetId: string,
    documentId: string,
    userId: string,
    config: CreateGraphExtractionConfigDto,
  ): Promise<GraphNode[]> {
    const nodes: GraphNode[] = [];

    for (const extractedNode of extractedNodes) {
      // Check for duplicates if deduplication is enabled
      if (config.enableDeduplication) {
        const existingNodes = await this.nodeRepository.find({
          where: {
            datasetId,
            nodeType: extractedNode.type,
            label: extractedNode.label,
          },
        });

        if (existingNodes.length > 0) {
          // Merge with existing node
          const existingNode = existingNodes[0];
          const mergedProperties = {
            ...existingNode.properties,
            ...extractedNode.properties,
          };

          await this.nodeRepository.update(existingNode.id, {
            properties: mergedProperties,
          });

          nodes.push(existingNode);
          continue;
        }
      }

      // Create new node
      const node = this.nodeRepository.create({
        datasetId,
        documentId,
        segmentId: segments[0].id, // Use first segment as reference
        nodeType: extractedNode.type,
        label: extractedNode.label,
        properties: extractedNode.properties || {},
        userId,
      });

      const savedNode = await this.nodeRepository.save(node);
      nodes.push(savedNode);
    }

    return nodes;
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
    this.logger.debug(
      `Available node labels: ${Array.from(nodeMap.keys()).join(', ')}`,
    );

    for (const extractedEdge of extractedEdges) {
      this.logger.debug(
        `Processing edge: ${extractedEdge.sourceNodeLabel} -> ${extractedEdge.targetNodeLabel} (${extractedEdge.edgeType})`,
      );

      const sourceNode = nodeMap.get(extractedEdge.sourceNodeLabel);
      const targetNode = nodeMap.get(extractedEdge.targetNodeLabel);

      if (!sourceNode || !targetNode) {
        this.logger.warn(
          `Source or target node not found for edge: ${extractedEdge.sourceNodeLabel} -> ${extractedEdge.targetNodeLabel}`,
        );
        this.logger.debug(
          `Available nodes: ${Array.from(nodeMap.keys()).join(', ')}`,
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

  private async getExtractionPrompt(promptId?: string): Promise<Prompt | null> {
    this.logger.log(`🔍 getExtractionPrompt called with promptId: ${promptId}`);

    if (promptId) {
      this.logger.log(`🔍 Looking up prompt by ID: ${promptId}`);
      try {
        const prompt = await this.promptService.findPromptById(promptId);
        this.logger.log(
          `📝 Prompt by ID result: ${prompt ? prompt.name : 'null'}`,
        );
        if (prompt) {
          this.logger.log(
            `📝 Prompt details: ID=${prompt.id}, Name=${prompt.name}, Active=${prompt.isActive}`,
          );
        }
        return prompt;
      } catch (error) {
        this.logger.error(`❌ Error looking up prompt by ID: ${error.message}`);
        throw error;
      }
    }

    // Get default graph extraction prompt
    this.logger.log(
      `🔍 Looking up default prompt by name: 'Social Media Graph Extraction'`,
    );
    const defaultPrompt = await this.promptRepository.findOne({
      where: {
        name: 'Social Media Graph Extraction',
        isActive: true,
      },
    });
    this.logger.log(
      `📝 Default prompt result: ${defaultPrompt ? defaultPrompt.name : 'null'}`,
    );
    return defaultPrompt;
  }

  private async getAiProvider(
    providerId?: string,
    datasetId?: string,
  ): Promise<any> {
    if (providerId) {
      this.logger.log(`🔍 Looking up AI provider by ID: ${providerId}`);
      try {
        const provider =
          await this.aiProviderService.findAiProviderById(providerId);
        if (provider) {
          this.logger.log(
            `✅ Found AI provider by ID: ${provider.name} (${provider.type})`,
          );
          this.logger.log(
            `🔍 Provider details: ${JSON.stringify(
              {
                id: provider.id,
                name: provider.name,
                type: provider.type,
                baseUrl: provider.baseUrl,
                hasApiKey: !!provider.apiKey,
                models: provider.models?.map((m) => m.id) || [],
              },
              null,
              2,
            )}`,
          );
          return provider;
        } else {
          this.logger.warn(`❌ AI provider not found by ID: ${providerId}`);
          this.logger.warn(
            `❌ This will cause the system to fail - no fallback allowed!`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Error looking up AI provider by ID ${providerId}: ${error.message}`,
        );
        this.logger.error(
          `❌ This will cause the system to fail - no fallback allowed!`,
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
        this.logger.log(`🔍 Looking for AI provider: ${providerValue}`);

        // Check if it's a UUID (provider ID) or a string (provider type/name)
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            providerValue,
          );

        if (isUuid) {
          // It's a provider ID, look it up directly
          this.logger.log(
            `🔍 Provider value is UUID, looking up by ID: ${providerValue}`,
          );
          const provider =
            await this.aiProviderService.findAiProviderById(providerValue);
          if (provider) {
            this.logger.log(
              `✅ Found AI provider by ID: ${provider.name} (${provider.type})`,
            );
            return provider;
          }
        } else {
          // It's a provider type/name, try to find by type
          this.logger.log(
            `🔍 Provider value is type/name, looking up by type: ${providerValue}`,
          );
          const provider = await this.aiProviderService.findAiProviderByType(
            providerValue,
            '72287e07-967e-4de6-88b0-ff8c16f43991', // Default user ID for now
          );

          if (provider) {
            this.logger.log(
              `✅ Found AI provider by type: ${provider.name} (${provider.type})`,
            );
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
    };

    return nodeTypeMap[nodeType?.toLowerCase()] || NodeType.ORGANIZATION;
  }

  private mapEdgeType(edgeType: string): EdgeType {
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
    };

    return edgeTypeMap[edgeType?.toLowerCase()] || EdgeType.RELATED_TO;
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
