import { DataSource } from 'typeorm';
import { Prompt } from '../../modules/prompts/entities/prompt.entity';

export async function seedSocialMediaGraphExtractionPrompt(
  dataSource: DataSource,
) {
  const promptRepository = dataSource.getRepository(Prompt);

  // Check if the prompt already exists
  const existingPrompt = await promptRepository.findOne({
    where: { name: 'Social Media Graph Extraction' },
  });

  if (existingPrompt) {
    console.log(
      'Social Media Graph Extraction prompt already exists, skipping...',
    );
    return;
  }

  const socialMediaGraphExtractionPrompt = {
    name: 'Social Media Graph Extraction',
    description:
      'Extract entities and relationships from social media data to build a knowledge graph',
    systemPrompt: `You are an expert at analyzing social media content and extracting structured information to build knowledge graphs. Your task is to identify entities (people, organizations, products, events, topics) and their relationships from social media posts, comments, and interactions.

Focus on extracting:
1. **People/Users**: Social media users, influencers, celebrities, public figures
2. **Organizations**: Companies, brands, institutions, groups
3. **Products**: Products, services, apps, tools mentioned
4. **Events**: Events, campaigns, launches, announcements
5. **Topics**: Hashtags, themes, subjects being discussed

For each entity, extract relevant properties like:
- Normalized names
- Social media platforms/channels
- Verification status
- Sentiment scores
- Confidence levels
- Temporal data (first/last mentioned, mention counts)

For relationships, identify:
- Mentions and interactions
- Sentiment between entities
- Collaboration and competition
- Influence and following
- Topic sharing and discussions

Be thorough but accurate. Only extract information that is clearly present in the text.`,

    userPromptTemplate: `Analyze the following social media content and extract entities and relationships for graph construction:

Content: {{content}}

Extract all relevant entities and their relationships. Focus on social media specific entities like users, posts, hashtags, mentions, and interactions.`,

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
                enum: ['person', 'organization', 'product', 'event', 'topic'],
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
                    description: 'Normalized/canonical name',
                  },
                  channel: {
                    type: 'string',
                    description: 'Social media platform or channel',
                  },
                  platform: {
                    type: 'string',
                    description: 'Specific platform (Twitter, Instagram, etc.)',
                  },
                  verified: {
                    type: 'boolean',
                    description: 'Whether the entity is verified',
                  },
                  follower_count: {
                    type: 'number',
                    description: 'Number of followers (if applicable)',
                  },
                  engagement_rate: {
                    type: 'number',
                    description: 'Engagement rate (if applicable)',
                  },
                  sentiment_score: {
                    type: 'number',
                    minimum: -1,
                    maximum: 1,
                    description:
                      'Sentiment score from -1 (negative) to 1 (positive)',
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Confidence score for this extraction',
                  },
                  temporal_data: {
                    type: 'object',
                    description: 'Temporal information about the entity',
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
                        type: 'number',
                        description: 'Number of times the entity was mentioned',
                      },
                    },
                  },
                },
                additionalProperties: true,
              },
            },
            required: ['id', 'type', 'label'],
          },
        },
        edges: {
          type: 'array',
          description: 'List of relationships between entities',
          items: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                description: 'Source entity label',
              },
              to: {
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
                description: 'Strength of the relationship (0-1)',
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
                    minimum: -1,
                    maximum: 1,
                    description: 'Sentiment score of the relationship',
                  },
                  confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Confidence score for this relationship',
                  },
                  context: {
                    type: 'string',
                    description: 'Context or description of the relationship',
                  },
                },
                additionalProperties: true,
              },
            },
            required: ['from', 'to', 'type'],
          },
        },
      },
      required: ['nodes', 'edges'],
      additionalProperties: false,
    },

    type: 'graph_extraction',
    isGlobal: true,
    isActive: true,
  };

  // Create the prompt (without userId since it's global)
  const prompt = promptRepository.create(socialMediaGraphExtractionPrompt);
  await promptRepository.save(prompt);

  console.log('✅ Social Media Graph Extraction prompt created successfully');
}
