import { DataSource } from 'typeorm';
import { Prompt } from '../../modules/prompts/entities/prompt.entity';

export async function seedGraphExtractionPrompts(
  dataSource: DataSource,
): Promise<void> {
  const promptRepository = dataSource.getRepository(Prompt);

  // Check if prompt already exists
  const existingPrompt = await promptRepository.findOne({
    where: { name: 'Graph Extraction - Social Media Analysis' },
  });

  if (existingPrompt) {
    console.log('Graph extraction prompt already exists, skipping...');
    return;
  }

  const prompt = promptRepository.create({
    name: 'Graph Extraction - Social Media Analysis',
    type: 'graph_extraction',
    description:
      'Extract entities and relationships from social media posts to build a knowledge graph',
    systemPrompt: `You are an expert social media analyst tasked with extracting structured data from social media posts to build a comprehensive knowledge graph. Your goal is to identify entities (people, brands, topics, hashtags, influencers) and their relationships.

For each social media post, extract:

**Entities (Nodes):**
- **Author**: The person or account that created the post
- **Brand**: Any company, product, or service mentioned
- **Topic**: Key themes or subjects discussed
- **Hashtag**: Hashtags used in the post
- **Influencer**: Individuals or accounts with significant reach or impact
- **Location**: Geographic locations mentioned
- **Organization**: Companies, institutions, or groups
- **Product**: Specific products mentioned
- **Event**: Specific events mentioned

**Relationships (Edges):**
- **mentions**: An author mentions a brand, topic, hashtag, influencer, location, organization, product, or event
- **sentiment**: An author expresses a sentiment towards a brand, topic, product, or event (positive, negative, neutral)
- **interacts_with**: An author interacts with another author (e.g., replies, tags)
- **discusses**: A topic is discussed in relation to a brand, product, or event
- **competes_with**: Two brands are identified as competitors
- **shares_topic**: Two brands or authors share a common topic
- **follows**: An author follows another author
- **collaborates**: Two entities work together
- **influences**: An influencer influences a brand or topic
- **located_in**: A brand, event, or author is located in a specific location
- **part_of**: A product is part of a brand
- **related_to**: Two entities are generally related

**Important Guidelines:**
1. Normalize brand names (e.g., "中銀香港" and "BOC HK" → "Bank of China Hong Kong")
2. Assign confidence scores between 0.5 and 1.0 for each extraction
3. Extract temporal context when available
4. Identify sentiment intensity and direction
5. Detect competitor mentions and relationships
6. Focus on high-confidence, relevant extractions

Return your analysis as a JSON object with "nodes" and "edges" arrays.`,

    userPromptTemplate: `Analyze the following social media post and extract entities and relationships:

**Post Content:**
{{content}}

**Post Metadata:**
- Platform: {{platform}}
- Author: {{author}}
- Date: {{date}}
- Engagement: {{engagement}}

**Instructions:**
1. Extract all relevant entities (nodes) with their types and properties
2. Identify relationships (edges) between entities
3. Assign confidence scores (0.5-1.0) to each extraction
4. Normalize brand names and author names
5. Extract sentiment and temporal data when available

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

    jsonSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
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
              },
              label: { type: 'string' },
              properties: {
                type: 'object',
                properties: {
                  normalized_name: { type: 'string' },
                  confidence: { type: 'number', minimum: 0.5, maximum: 1.0 },
                  sentiment_score: { type: 'number', minimum: -1, maximum: 1 },
                  temporal_data: {
                    type: 'object',
                    properties: {
                      first_mentioned: { type: 'string', format: 'date-time' },
                      last_mentioned: { type: 'string', format: 'date-time' },
                      mention_count: { type: 'number' },
                    },
                  },
                },
                additionalProperties: true,
              },
            },
            required: ['type', 'label', 'properties'],
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              target: { type: 'string' },
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
                  'related_to',
                ],
              },
              weight: { type: 'number', minimum: 0, maximum: 1 },
              properties: {
                type: 'object',
                properties: {
                  sentiment: {
                    type: 'string',
                    enum: ['positive', 'negative', 'neutral'],
                  },
                  sentiment_score: { type: 'number', minimum: 0, maximum: 1 },
                  interaction_count: { type: 'number' },
                  engagement_rate: { type: 'number' },
                  temporal_data: {
                    type: 'object',
                    properties: {
                      first_interaction: {
                        type: 'string',
                        format: 'date-time',
                      },
                      last_interaction: { type: 'string', format: 'date-time' },
                      frequency: { type: 'number' },
                    },
                  },
                  confidence: { type: 'number', minimum: 0.5, maximum: 1.0 },
                  context: { type: 'string' },
                },
                additionalProperties: true,
              },
            },
            required: ['source', 'target', 'type', 'weight', 'properties'],
          },
        },
      },
      required: ['nodes', 'edges'],
    },
    isGlobal: true,
    isActive: true,
    userId: '00000000-0000-0000-0000-000000000000', // Global prompt
  });

  await promptRepository.save(prompt);
  console.log('✅ Graph extraction prompt created successfully');
}
