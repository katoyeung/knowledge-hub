const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function createGraphPrompt() {
  try {
    await client.connect();
    console.log("Connected to database");

    // Check if prompt already exists
    const checkResult = await client.query(
      "SELECT id FROM prompts WHERE name = 'Graph Extraction Prompt'"
    );

    if (checkResult.rows.length > 0) {
      console.log("Graph extraction prompt already exists");
      return;
    }

    // Create the graph extraction prompt
    const promptData = {
      name: "Graph Extraction Prompt",
      description:
        "Extracts entities and relationships from text for graph database population.",
      promptType: "GRAPH_EXTRACTION",
      template: `You are an expert in social media analysis and graph database modeling.
Your task is to extract entities (nodes) and their relationships (edges) from the provided social media text.
Focus on identifying authors, brands, topics, hashtags, and their interactions.

Output the extracted information as a JSON object with two main arrays: 'nodes' and 'edges'.

Nodes should have:
- 'type': (e.g., 'author', 'brand', 'topic', 'hashtag', 'influencer', 'location', 'organization', 'product', 'event')
- 'label': The primary name or value of the entity
- 'properties': An object for additional attributes (e.g., 'normalized_name', 'channel', 'platform', 'verified', 'follower_count', 'sentiment_score', 'confidence', 'temporal_data')

Edges should have:
- 'sourceNodeLabel': The label of the source node
- 'targetNodeLabel': The label of the target node
- 'edgeType': (e.g., 'mentions', 'sentiment', 'interacts_with', 'competes_with', 'discusses', 'shares_topic', 'follows', 'collaborates', 'influences', 'located_in', 'part_of', 'related_to')
- 'properties': An object for additional attributes (e.g., 'sentiment', 'sentiment_score', 'interaction_count', 'confidence', 'context', 'temporal_data')

Ensure that all 'sourceNodeLabel' and 'targetNodeLabel' values for edges correspond to 'label' values in the 'nodes' array.
If a node is mentioned multiple times, create only one node entry.
Infer sentiment for 'mentions' or 'interacts_with' edges if possible.

Social Media Text:
"""
{{text}}
"""

Example JSON Output:
{
  "nodes": [
    {
      "type": "author",
      "label": "JohnDoe",
      "properties": {
        "platform": "Twitter",
        "follower_count": 15000,
        "verified": true
      }
    },
    {
      "type": "brand",
      "label": "TechInnovate",
      "properties": {
        "normalized_name": "Tech Innovate Inc."
      }
    },
    {
      "type": "topic",
      "label": "AI Ethics",
      "properties": {}
    },
    {
      "type": "hashtag",
      "label": "#FutureTech",
      "properties": {}
    }
  ],
  "edges": [
    {
      "sourceNodeLabel": "JohnDoe",
      "targetNodeLabel": "TechInnovate",
      "edgeType": "mentions",
      "properties": {
        "sentiment": "positive",
        "sentiment_score": 0.85,
        "context": "praised their new product"
      }
    },
    {
      "sourceNodeLabel": "JohnDoe",
      "targetNodeLabel": "AI Ethics",
      "edgeType": "discusses",
      "properties": {}
    },
    {
      "sourceNodeLabel": "TechInnovate",
      "targetNodeLabel": "#FutureTech",
      "edgeType": "uses_hashtag",
      "properties": {}
    }
  ]
}`,
      outputSchema: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "author",
                    "brand",
                    "topic",
                    "hashtag",
                    "influencer",
                    "location",
                    "organization",
                    "product",
                    "event",
                  ],
                },
                label: { type: "string" },
                properties: {
                  type: "object",
                  properties: {
                    normalized_name: { type: "string" },
                    channel: { type: "string" },
                    platform: { type: "string" },
                    verified: { type: "boolean" },
                    follower_count: { type: "number" },
                    engagement_rate: { type: "number" },
                    sentiment_score: { type: "number" },
                    confidence: { type: "number" },
                    temporal_data: {
                      type: "object",
                      properties: {
                        first_mentioned: {
                          type: "string",
                          format: "date-time",
                        },
                        last_mentioned: { type: "string", format: "date-time" },
                        mention_count: { type: "number" },
                      },
                    },
                  },
                },
              },
              required: ["type", "label"],
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceNodeLabel: { type: "string" },
                targetNodeLabel: { type: "string" },
                edgeType: {
                  type: "string",
                  enum: [
                    "mentions",
                    "sentiment",
                    "interacts_with",
                    "competes_with",
                    "discusses",
                    "shares_topic",
                    "follows",
                    "collaborates",
                    "influences",
                    "located_in",
                    "part_of",
                    "related_to",
                  ],
                },
                weight: { type: "number" },
                properties: {
                  type: "object",
                  properties: {
                    sentiment: {
                      type: "string",
                      enum: ["positive", "negative", "neutral"],
                    },
                    sentiment_score: { type: "number" },
                    interaction_count: { type: "number" },
                    engagement_rate: { type: "number" },
                    temporal_data: {
                      type: "object",
                      properties: {
                        first_interaction: {
                          type: "string",
                          format: "date-time",
                        },
                        last_interaction: {
                          type: "string",
                          format: "date-time",
                        },
                        frequency: { type: "number" },
                      },
                    },
                    confidence: { type: "number" },
                    context: { type: "string" },
                  },
                },
              },
              required: ["sourceNodeLabel", "targetNodeLabel", "edgeType"],
            },
          },
        },
        required: ["nodes", "edges"],
      },
      isGlobal: true,
      isActive: true,
      userId: "00000000-0000-0000-0000-000000000000", // Global prompt
    };

    const result = await client.query(
      `INSERT INTO prompts (id, name, description, type, "systemPrompt", "userPromptTemplate", "jsonSchema", "isGlobal", "isActive", "userId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        promptData.name,
        promptData.description,
        promptData.promptType,
        promptData.template,
        promptData.template, // userPromptTemplate
        JSON.stringify(promptData.outputSchema),
        promptData.isGlobal,
        promptData.isActive,
        promptData.userId,
      ]
    );

    console.log("✅ Graph extraction prompt created successfully");
  } catch (error) {
    console.error("❌ Error creating graph extraction prompt:", error);
  } finally {
    await client.end();
  }
}

createGraphPrompt();
