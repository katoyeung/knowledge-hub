const { Client } = require("pg");

const client = new Client({
  host: "localhost",
  port: 5432,
  database: "knowledge_hub",
  user: "root",
  password: "root",
});

async function updateGraphPrompt() {
  try {
    await client.connect();
    console.log("Connected to database");

    // Update the graph extraction prompt with correct edge types
    const updatedTemplate = `You are an expert in social media analysis and graph database modeling.
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
- 'edgeType': MUST be one of these exact values: 'mentions', 'sentiment', 'interacts_with', 'competes_with', 'discusses', 'shares_topic', 'follows', 'collaborates', 'influences', 'located_in', 'part_of', 'related_to'
- 'properties': An object for additional attributes (e.g., 'sentiment', 'sentiment_score', 'interaction_count', 'confidence', 'context', 'temporal_data')

IMPORTANT: Only use the exact edgeType values listed above. Do not create custom edge types.

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
      "edgeType": "related_to",
      "properties": {}
    }
  ]
}`;

    const result = await client.query(
      `UPDATE prompts 
       SET system_prompt = $1, user_prompt_template = $1, updated_at = NOW()
       WHERE name = $2`,
      [updatedTemplate, "Graph Extraction - Social Media Analysis"]
    );

    if (result.rowCount > 0) {
      console.log("✅ Graph extraction prompt updated successfully");
    } else {
      console.log("❌ No prompt found to update");
    }
  } catch (error) {
    console.error("❌ Error updating graph extraction prompt:", error);
  } finally {
    await client.end();
  }
}

updateGraphPrompt();
