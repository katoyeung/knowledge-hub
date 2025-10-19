/**
 * Complete setup for Ollama Social Media Graph Extraction
 *
 * This script handles the complete setup process:
 * 1. Creates the Social Media Graph Extraction prompt
 * 2. Updates Crumplete AI provider to ollama type
 * 3. Tests the setup with sample data
 */

const { execSync } = require("child_process");
const axios = require("axios");
const path = require("path");

const BASE_URL = "http://localhost:3001";

async function waitForServer(maxRetries = 30, delay = 2000) {
  console.log("⏳ Waiting for server to be ready...");

  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(`${BASE_URL}/api/health`);
      console.log("✅ Server is ready!");
      return true;
    } catch (error) {
      if (i === maxRetries - 1) {
        console.log("❌ Server is not responding after maximum retries");
        return false;
      }
      console.log(
        `   Attempt ${i + 1}/${maxRetries} - Server not ready, waiting ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
}

async function runMigrations() {
  console.log("\n🔄 Step 1: Running database migrations...");
  console.log("-".repeat(40));

  try {
    const backendDir = path.join(__dirname, "apps", "backend");
    process.chdir(backendDir);

    execSync("npm run typeorm:migration:run", { stdio: "inherit" });
    console.log("✅ Migrations completed successfully");
    return true;
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    return false;
  }
}

async function createSocialMediaPrompt() {
  console.log("\n📝 Step 2: Creating Social Media Graph Extraction prompt...");
  console.log("-".repeat(40));

  try {
    // Check if prompt already exists
    const existingPromptsResponse = await axios.get(`${BASE_URL}/api/prompts`);
    const existingPrompts =
      existingPromptsResponse.data.data || existingPromptsResponse.data;

    const existingPrompt = existingPrompts.find(
      (p) =>
        p.name.toLowerCase().includes("social media") &&
        p.name.toLowerCase().includes("graph extraction")
    );

    if (existingPrompt) {
      console.log("✅ Social Media Graph Extraction prompt already exists!");
      console.log(`   ID: ${existingPrompt.id}`);
      console.log(`   Name: ${existingPrompt.name}`);
      return existingPrompt;
    }

    // Create the prompt
    const socialMediaPrompt = {
      name: "Social Media Graph Extraction",
      description:
        "Extract entities and relationships from social media data to build a knowledge graph",
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
        type: "object",
        properties: {
          nodes: {
            type: "array",
            description: "List of entities found in the content",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique identifier for the entity",
                },
                type: {
                  type: "string",
                  enum: ["person", "organization", "product", "event", "topic"],
                  description: "Type of entity",
                },
                label: {
                  type: "string",
                  description: "Display name of the entity",
                },
                properties: {
                  type: "object",
                  description: "Additional properties of the entity",
                  properties: {
                    normalized_name: {
                      type: "string",
                      description: "Normalized/canonical name",
                    },
                    channel: {
                      type: "string",
                      description: "Social media platform or channel",
                    },
                    platform: {
                      type: "string",
                      description:
                        "Specific platform (Twitter, Instagram, etc.)",
                    },
                    verified: {
                      type: "boolean",
                      description: "Whether the entity is verified",
                    },
                    follower_count: {
                      type: "number",
                      description: "Number of followers (if applicable)",
                    },
                    engagement_rate: {
                      type: "number",
                      description: "Engagement rate (if applicable)",
                    },
                    sentiment_score: {
                      type: "number",
                      minimum: -1,
                      maximum: 1,
                      description:
                        "Sentiment score from -1 (negative) to 1 (positive)",
                    },
                    confidence: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                      description: "Confidence score for this extraction",
                    },
                    temporal_data: {
                      type: "object",
                      description: "Temporal information about the entity",
                      properties: {
                        first_mentioned: {
                          type: "string",
                          format: "date-time",
                          description: "When the entity was first mentioned",
                        },
                        last_mentioned: {
                          type: "string",
                          format: "date-time",
                          description: "When the entity was last mentioned",
                        },
                        mention_count: {
                          type: "number",
                          description:
                            "Number of times the entity was mentioned",
                        },
                      },
                    },
                  },
                  additionalProperties: true,
                },
              },
              required: ["id", "type", "label"],
            },
          },
          edges: {
            type: "array",
            description: "List of relationships between entities",
            items: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source entity label" },
                to: { type: "string", description: "Target entity label" },
                type: {
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
                  description: "Type of relationship",
                },
                weight: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                  description: "Strength of the relationship (0-1)",
                },
                properties: {
                  type: "object",
                  description: "Additional properties of the relationship",
                  properties: {
                    sentiment: {
                      type: "string",
                      enum: ["positive", "negative", "neutral"],
                      description: "Sentiment of the relationship",
                    },
                    sentiment_score: {
                      type: "number",
                      minimum: -1,
                      maximum: 1,
                      description: "Sentiment score of the relationship",
                    },
                    confidence: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                      description: "Confidence score for this relationship",
                    },
                    context: {
                      type: "string",
                      description: "Context or description of the relationship",
                    },
                  },
                  additionalProperties: true,
                },
              },
              required: ["from", "to", "type"],
            },
          },
        },
        required: ["nodes", "edges"],
        additionalProperties: false,
      },
      type: "graph_extraction",
      isGlobal: true,
      isActive: true,
    };

    const createResponse = await axios.post(
      `${BASE_URL}/api/prompts`,
      socialMediaPrompt,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const createdPrompt = createResponse.data;
    console.log(
      "✅ Social Media Graph Extraction prompt created successfully!"
    );
    console.log(`   ID: ${createdPrompt.id}`);
    console.log(`   Name: ${createdPrompt.name}`);
    return createdPrompt;
  } catch (error) {
    console.error("❌ Failed to create prompt:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    return null;
  }
}

async function updateCrumpleteAIProvider() {
  console.log("\n🔄 Step 3: Updating Crumplete AI provider to ollama type...");
  console.log("-".repeat(40));

  try {
    // Get current providers
    const providersResponse = await axios.get(`${BASE_URL}/api/ai-providers`);
    const providers = providersResponse.data.data || providersResponse.data;

    const crumpleteProvider = providers.find(
      (p) =>
        p.name.toLowerCase().includes("crumplete") ||
        p.name.toLowerCase().includes("crumplete ai")
    );

    if (!crumpleteProvider) {
      console.log("❌ Crumplete AI provider not found. Available providers:");
      providers.forEach((p) => console.log(`  - ${p.name} (${p.type})`));
      return null;
    }

    console.log(
      `✅ Found Crumplete AI provider: ${crumpleteProvider.name} (${crumpleteProvider.type})`
    );

    // Update the provider
    const updateData = {
      type: "ollama",
      baseUrl: "https://llmendpoint.crumplete.dev",
      models: [
        {
          id: "llama4:scout",
          name: "Llama 4 Scout",
          description:
            "Advanced Llama 4 model with structured output capabilities",
          maxTokens: 4096,
          contextWindow: 8192,
          pricing: { input: 0.0001, output: 0.0001 },
        },
        {
          id: "llama3.1:8b",
          name: "Llama 3.1 8B",
          description: "Efficient Llama 3.1 8B model",
          maxTokens: 2048,
          contextWindow: 4096,
          pricing: { input: 0.00005, output: 0.00005 },
        },
      ],
    };

    const updateResponse = await axios.patch(
      `${BASE_URL}/api/ai-providers/${crumpleteProvider.id}`,
      updateData,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("✅ Crumplete AI provider updated successfully!");
    console.log(`   New type: ${updateResponse.data.type}`);
    console.log(`   Models: ${updateResponse.data.models?.length || 0}`);
    return updateResponse.data;
  } catch (error) {
    console.error("❌ Failed to update provider:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    return null;
  }
}

async function testSetup() {
  console.log("\n🧪 Step 4: Testing the setup...");
  console.log("-".repeat(40));

  try {
    const sampleData = `
Twitter Post by @techcrunch:
"🚀 Exciting news! @OpenAI has just announced GPT-4 Turbo with vision capabilities. 
The new model can process images and text together, opening up possibilities for 
multimodal AI applications. #AI #MachineLearning #OpenAI #Innovation

@elonmusk replied: "This is incredible! The future of AI is multimodal. 
@tesla could benefit greatly from this technology for autonomous driving."

@samaltman liked the post and commented: "Thanks @elonmusk! We're excited to see 
what developers will build with GPT-4 Turbo. The vision capabilities are just the beginning."
`;

    // Get providers and prompts
    const [providersResponse, promptsResponse] = await Promise.all([
      axios.get(`${BASE_URL}/api/ai-providers`),
      axios.get(`${BASE_URL}/api/prompts`),
    ]);

    const providers = providersResponse.data.data || providersResponse.data;
    const prompts = promptsResponse.data.data || promptsResponse.data;

    const crumpleteProvider = providers.find((p) => p.type === "ollama");
    const socialMediaPrompt = prompts.find(
      (p) =>
        p.name.toLowerCase().includes("social media") &&
        p.name.toLowerCase().includes("graph extraction")
    );

    if (!crumpleteProvider || !socialMediaPrompt) {
      console.log("❌ Missing required components for testing");
      return false;
    }

    console.log("📤 Sending test request...");
    const testPayload = {
      messages: [
        {
          role: "user",
          content: socialMediaPrompt.userPromptTemplate.replace(
            "{{content}}",
            sampleData
          ),
        },
      ],
      model: "llama4:scout",
      temperature: 0.7,
      max_tokens: 4096,
      jsonSchema: socialMediaPrompt.jsonSchema,
    };

    const startTime = Date.now();
    const testResponse = await axios.post(
      `${BASE_URL}/api/ai-providers/${crumpleteProvider.id}/chat-completion`,
      testPayload,
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );
    const duration = Date.now() - startTime;

    const content = testResponse.data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        console.log("✅ Test successful!");
        console.log(`   Response time: ${duration}ms`);
        console.log(`   Nodes extracted: ${parsed.nodes?.length || 0}`);
        console.log(`   Edges extracted: ${parsed.edges?.length || 0}`);
        return true;
      } catch (parseError) {
        console.log("⚠️ Test completed but response is not valid JSON");
        console.log(`   Response preview: ${content.substring(0, 200)}...`);
        return false;
      }
    } else {
      console.log("❌ Test failed - no content in response");
      return false;
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return false;
  }
}

async function main() {
  console.log("🚀 Setting up Ollama Social Media Graph Extraction");
  console.log("=".repeat(60));

  try {
    // Wait for server
    const serverReady = await waitForServer();
    if (!serverReady) {
      console.log(
        "❌ Server is not ready. Please start the backend server first."
      );
      process.exit(1);
    }

    // Run migrations
    const migrationsSuccess = await runMigrations();
    if (!migrationsSuccess) {
      console.log(
        "❌ Migrations failed. Please check the database connection."
      );
      process.exit(1);
    }

    // Create prompt
    const prompt = await createSocialMediaPrompt();
    if (!prompt) {
      console.log(
        "❌ Failed to create prompt. Please check the API connection."
      );
      process.exit(1);
    }

    // Update provider
    const provider = await updateCrumpleteAIProvider();
    if (!provider) {
      console.log(
        "❌ Failed to update provider. Please check the API connection."
      );
      process.exit(1);
    }

    // Test setup
    const testSuccess = await testSetup();
    if (!testSuccess) {
      console.log(
        "⚠️ Setup completed but test failed. You may need to check the Crumplete AI connection."
      );
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Setup completed successfully!");
    console.log("\nSummary:");
    console.log(`✅ Migrations: Completed`);
    console.log(`✅ Prompt: ${prompt.name} (${prompt.id})`);
    console.log(`✅ Provider: ${provider.name} (${provider.type})`);
    console.log(`✅ Test: ${testSuccess ? "Passed" : "Failed"}`);

    console.log("\nNext steps:");
    console.log("1. The Social Media Graph Extraction prompt is ready to use");
    console.log("2. Crumplete AI provider is configured for ollama type");
    console.log(
      "3. You can now use the graph extraction features with social media data"
    );
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
}

// Run the setup
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
