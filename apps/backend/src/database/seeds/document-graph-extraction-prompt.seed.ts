import { DataSource } from 'typeorm';
import { Prompt } from '../../modules/prompts/entities/prompt.entity';

export async function seedDocumentGraphExtractionPrompt(
  dataSource: DataSource,
): Promise<void> {
  const promptRepository = dataSource.getRepository(Prompt);

  // Check if the prompt already exists
  const existingPrompt = await promptRepository.findOne({
    where: { name: 'Document Graph Extraction' },
  });

  if (existingPrompt) {
    console.log('Document Graph Extraction prompt already exists, skipping...');
    return;
  }

  const documentGraphExtractionPrompt = {
    name: 'Document Graph Extraction',
    description:
      'Extract entities and relationships from document content to build a knowledge graph',
    systemPrompt: `You are an expert at analyzing document content and extracting structured information to build knowledge graphs. Your task is to identify entities (people, organizations, concepts, locations, events) and their relationships from document text.

Focus on extracting:
1. **People**: Authors, mentioned individuals, public figures, experts
2. **Organizations**: Companies, institutions, government bodies, groups
3. **Concepts**: Topics, themes, ideas, technical terms, methodologies
4. **Locations**: Geographic locations, addresses, regions, countries
5. **Events**: Historical events, meetings, conferences, incidents
6. **Products**: Products, services, technologies, tools mentioned
7. **Topics**: Subject matters, themes, categories being discussed

For each entity, extract relevant properties like:
- Normalized names
- Confidence levels
- Context and relevance
- Temporal data when available
- Categorization and classification

For relationships, identify:
- Mentions and references
- Hierarchical relationships (part-of, contains)
- Causal relationships (causes, results-in)
- Associative relationships (related-to, associated-with)
- Temporal relationships (before, after, during)
- Spatial relationships (located-in, near, within)

Be thorough but accurate. Only extract information that is clearly present in the text. Focus on meaningful relationships that add value to the knowledge graph.`,
    userPromptTemplate: `Analyze the following document content and extract entities and relationships for graph construction:

**Document Content:**
{{content}}

**Instructions:**
1. Extract all relevant entities (nodes) with their types and properties
2. Identify relationships (edges) between entities
3. Assign confidence scores (0.5-1.0) to each extraction
4. Focus on document-specific entities like concepts, organizations, people, locations, and topics
5. Extract relationships that make sense in the context of the document
6. Use appropriate entity types based on the content domain

Return as JSON with this structure:
{
  "nodes": [
    {
      "type": "author|brand|topic|hashtag|influencer|location|organization|product|event",
      "label": "entity name",
      "properties": {
        "normalized_name": "standardized name",
        "confidence": 0.8,
        "sentiment_score": 0.7,
        "temporal_data": {
          "first_mentioned": "2024-01-01T00:00:00Z",
          "last_mentioned": "2024-01-01T00:00:00Z",
          "mention_count": 1
        }
      }
    }
  ],
  "edges": [
    {
      "source": "source entity label",
      "target": "target entity label",
      "type": "mentions|sentiment|interacts_with|competes_with|discusses|shares_topic|follows|collaborates|influences|located_in|part_of|related_to",
      "weight": 1.0,
      "properties": {
        "sentiment": "positive|negative|neutral",
        "sentiment_score": 0.8,
        "confidence": 0.9,
        "context": "supporting text snippet"
      }
    }
  ]
}`,
    type: 'graph_extraction',
    isGlobal: true,
    isActive: true,
    jsonSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: 'List of entities found in the content',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the entity',
              },
              type: {
                type: 'string',
                enum: [
                  'author',
                  'brand',
                  'topic',
                  'hashtag',
                  'influencer',
                  'location',
                  'organization',
                  'product',
                  'event',
                ],
                description: 'Type of entity',
              },
              label: {
                type: 'string',
                description: 'Display name of the entity',
              },
              properties: {
                type: 'object',
                description: 'Additional properties of the entity',
                properties: {
                  normalized_name: {
                    type: 'string',
                    description: 'Standardized name of the entity',
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0.5,
                    maximum: 1.0,
                    description: 'Confidence score for the entity extraction',
                  },
                  sentiment_score: {
                    type: 'number',
                    minimum: -1.0,
                    maximum: 1.0,
                    description: 'Sentiment score of the entity',
                  },
                  temporal_data: {
                    type: 'object',
                    properties: {
                      first_mentioned: {
                        type: 'string',
                        format: 'date-time',
                        description: 'When the entity was first mentioned',
                      },
                      last_mentioned: {
                        type: 'string',
                        format: 'date-time',
                        description: 'When the entity was last mentioned',
                      },
                      mention_count: {
                        type: 'integer',
                        minimum: 1,
                        description: 'Number of times the entity was mentioned',
                      },
                    },
                  },
                },
              },
            },
            required: ['type', 'label'],
          },
        },
        edges: {
          type: 'array',
          description: 'List of relationships between entities',
          items: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'Source entity label',
              },
              target: {
                type: 'string',
                description: 'Target entity label',
              },
              type: {
                type: 'string',
                enum: [
                  'mentions',
                  'sentiment',
                  'interacts_with',
                  'competes_with',
                  'discusses',
                  'shares_topic',
                  'follows',
                  'collaborates',
                  'influences',
                  'located_in',
                  'part_of',
                  'related_to',
                ],
                description: 'Type of relationship',
              },
              weight: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Weight/strength of the relationship',
              },
              properties: {
                type: 'object',
                description: 'Additional properties of the relationship',
                properties: {
                  sentiment: {
                    type: 'string',
                    enum: ['positive', 'negative', 'neutral'],
                    description: 'Sentiment of the relationship',
                  },
                  sentiment_score: {
                    type: 'number',
                    minimum: -1.0,
                    maximum: 1.0,
                    description: 'Sentiment score of the relationship',
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0.5,
                    maximum: 1.0,
                    description:
                      'Confidence score for the relationship extraction',
                  },
                  context: {
                    type: 'string',
                    description: 'Supporting text snippet for the relationship',
                  },
                },
              },
            },
            required: ['source', 'target', 'type'],
          },
        },
      },
      required: ['nodes', 'edges'],
    },
  };

  await promptRepository.save(documentGraphExtractionPrompt);
  console.log('✅ Document Graph Extraction prompt seeded successfully');
}
