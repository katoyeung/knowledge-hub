/**
 * Test Crumplete AI provider with Social Media Graph Extraction prompt
 *
 * This script tests the Crumplete AI provider (ollama type) with the llama4:scout model
 * using the Social Media Graph Extraction prompt to extract entities and relationships
 * from social media data.
 */

const axios = require("axios");

const BASE_URL = "http://localhost:3001";

// Admin credentials from the seed
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";

let authToken = null;

// Sample social media data for testing
const sampleSocialMediaData = `
Twitter Post by @techcrunch:
"🚀 Exciting news! @OpenAI has just announced GPT-4 Turbo with vision capabilities. 
The new model can process images and text together, opening up possibilities for 
multimodal AI applications. #AI #MachineLearning #OpenAI #Innovation

@elonmusk replied: "This is incredible! The future of AI is multimodal. 
@tesla could benefit greatly from this technology for autonomous driving."

@samaltman liked the post and commented: "Thanks @elonmusk! We're excited to see 
what developers will build with GPT-4 Turbo. The vision capabilities are just the beginning."

@microsoft also shared: "Proud to partner with @OpenAI on this breakthrough. 
Azure AI services will integrate these new capabilities seamlessly."

#AI #MachineLearning #OpenAI #Microsoft #Tesla #Innovation #TechNews
`;

async function authenticate() {
  console.log("🔐 Authenticating with admin credentials...");
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    authToken = response.data.access_token;
    console.log("✅ Authentication successful");
    return authToken;
  } catch (error) {
    console.error("❌ Authentication failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    throw error;
  }
}

async function testCrumpleteAISocialMedia() {
  console.log("🚀 Testing Crumplete AI with Social Media Graph Extraction\n");
  console.log("=".repeat(60));

  try {
    // Authenticate first
    await authenticate();

    // 1. Get available AI providers
    console.log("\n📋 Step 1: Getting available AI providers...");
    const providersResponse = await axios.get(`${BASE_URL}/ai-providers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const providers = providersResponse.data.data || providersResponse.data;

    console.log(`Found ${providers.length} AI providers:`);
    providers.forEach((provider) => {
      console.log(
        `- ${provider.name} (${provider.type}) - ${provider.isActive ? "Active" : "Inactive"}`
      );
    });

    // 2. Find Crumplete AI provider (should be ollama type)
    const crumpleteProvider = providers.find(
      (p) => p.name.toLowerCase().includes("crumplete") || p.type === "ollama"
    );

    if (!crumpleteProvider) {
      console.log("❌ Crumplete AI provider not found. Available providers:");
      providers.forEach((p) => console.log(`  - ${p.name} (${p.type})`));
      return;
    }

    console.log(
      `\n✅ Found Crumplete AI provider: ${crumpleteProvider.name} (${crumpleteProvider.type})`
    );
    console.log(`   Available: ${crumpleteProvider.available ? "Yes" : "No"}`);
    console.log(`   Models: ${crumpleteProvider.models?.length || 0}`);

    // 3. Get available prompts
    console.log("\n📋 Step 2: Getting available prompts...");
    const promptsResponse = await axios.get(`${BASE_URL}/prompts`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const prompts = promptsResponse.data.data || promptsResponse.data;

    const socialMediaPrompt = prompts.find(
      (p) =>
        p.name.toLowerCase().includes("social media") &&
        p.name.toLowerCase().includes("graph extraction")
    );

    if (!socialMediaPrompt) {
      console.log(
        "❌ Social Media Graph Extraction prompt not found. Available prompts:"
      );
      prompts.forEach((p) => console.log(`  - ${p.name} (${p.type})`));
      return;
    }

    console.log(
      `✅ Found Social Media Graph Extraction prompt: ${socialMediaPrompt.name}`
    );
    console.log(`   Type: ${socialMediaPrompt.type}`);
    console.log(`   Global: ${socialMediaPrompt.isGlobal ? "Yes" : "No"}`);
    console.log(`   Active: ${socialMediaPrompt.isActive ? "Yes" : "No"}`);

    // 4. Test the prompt with Crumplete AI
    console.log(
      "\n🤖 Step 3: Testing Social Media Graph Extraction with Crumplete AI..."
    );

    const testPayload = {
      messages: [
        {
          role: "system",
          content: socialMediaPrompt.systemPrompt,
        },
        {
          role: "user",
          content: socialMediaPrompt.userPromptTemplate.replace(
            "{{content}}",
            sampleSocialMediaData
          ),
        },
      ],
      model: "llama4:scout", // Crumplete AI model
      temperature: 0.7,
      max_tokens: 2048, // Reduced from 4096
    };

    console.log("📤 Sending request to Crumplete AI...");
    console.log(`   Model: llama4:scout`);
    console.log(
      `   Provider: ${crumpleteProvider.name} (${crumpleteProvider.type})`
    );
    console.log(`   Prompt: ${socialMediaPrompt.name}`);

    const startTime = Date.now();

    // Use the Crumplete AI endpoint directly
    const llmResponse = await axios.post(
      "https://llmendpoint.crumplete.dev/api/chat/completions",
      testPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-8bd74f9c88964bf3accd078fc7c996cc",
        },
        timeout: 30000, // 30 seconds timeout for graph extraction
      }
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`\n✅ Response received in ${duration}ms`);

    const content = llmResponse.data.choices?.[0]?.message?.content;
    if (content) {
      console.log("\n📝 Raw Response Content:");
      console.log("-".repeat(40));
      console.log(content);
      console.log("-".repeat(40));

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(content);
        console.log("\n✅ Valid JSON structure received:");
        console.log(JSON.stringify(parsed, null, 2));

        // Validate the structure
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          console.log(`\n📊 Graph Extraction Results:`);
          console.log(`   Nodes extracted: ${parsed.nodes.length}`);
          console.log(`   Edges extracted: ${parsed.edges?.length || 0}`);

          if (parsed.nodes.length > 0) {
            console.log(`\n👥 Sample Nodes:`);
            parsed.nodes.slice(0, 3).forEach((node, index) => {
              console.log(`   ${index + 1}. ${node.label} (${node.type})`);
              if (node.properties) {
                console.log(
                  `      Properties: ${JSON.stringify(node.properties, null, 6)}`
                );
              }
            });
          }

          if (parsed.edges && parsed.edges.length > 0) {
            console.log(`\n🔗 Sample Edges:`);
            parsed.edges.slice(0, 3).forEach((edge, index) => {
              console.log(
                `   ${index + 1}. ${edge.from} --[${edge.type}]--> ${edge.to}`
              );
              if (edge.properties) {
                console.log(
                  `      Properties: ${JSON.stringify(edge.properties, null, 6)}`
                );
              }
            });
          }
        } else {
          console.log("⚠️ Response doesn't contain expected 'nodes' array");
        }
      } catch (parseError) {
        console.log(`❌ Response is not valid JSON: ${parseError.message}`);
        console.log("Raw content that failed to parse:");
        console.log(content.substring(0, 500) + "...");
      }
    } else {
      console.log("❌ No content in response");
    }

    // 5. Test with different social media content
    console.log("\n🔄 Step 4: Testing with different social media content...");

    const instagramData = `
Instagram Post by @nike:
"Just do it! 🏃‍♀️💪 New Air Max 270 dropping tomorrow. 
Who's ready to level up their game? #JustDoIt #Nike #AirMax #Sneakers #Fitness

@lebronjames commented: "These are fire! 🔥 Can't wait to get my pair. 
#KingJames #NikeFamily"

@serenawilliams replied: "Love the new design! Perfect for my morning runs. 
#Tennis #Fitness #NikeGirl"

@adidas_official liked the post
@underarmour also liked the post

#SneakerHead #Athletics #Sports #Fashion
`;

    const instagramPayload = {
      messages: [
        {
          role: "system",
          content: socialMediaPrompt.systemPrompt,
        },
        {
          role: "user",
          content: socialMediaPrompt.userPromptTemplate.replace(
            "{{content}}",
            instagramData
          ),
        },
      ],
      model: "llama4:scout",
      temperature: 0.7,
      max_tokens: 2048,
    };

    console.log("📤 Testing with Instagram data...");
    const instagramResponse = await axios.post(
      "https://llmendpoint.crumplete.dev/api/chat/completions",
      instagramPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-8bd74f9c88964bf3accd078fc7c996cc",
        },
        timeout: 30000,
      }
    );

    const instagramContent =
      instagramResponse.data.choices?.[0]?.message?.content;
    if (instagramContent) {
      try {
        const instagramParsed = JSON.parse(instagramContent);
        console.log(`✅ Instagram test successful:`);
        console.log(`   Nodes: ${instagramParsed.nodes?.length || 0}`);
        console.log(`   Edges: ${instagramParsed.edges?.length || 0}`);
      } catch (error) {
        console.log(`❌ Instagram test failed to parse JSON: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log(
      "✅ Crumplete AI Social Media Graph Extraction test completed!"
    );
    console.log("\nSummary:");
    console.log(
      `- Provider: ${crumpleteProvider.name} (${crumpleteProvider.type})`
    );
    console.log(`- Model: llama4:scout`);
    console.log(`- Prompt: ${socialMediaPrompt.name}`);
    console.log(`- Response time: ${duration}ms`);
    console.log(`- Structured output: ${content ? "Working" : "Failed"}`);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
  }
}

// Run the test
if (require.main === module) {
  testCrumpleteAISocialMedia().catch(console.error);
}

module.exports = { testCrumpleteAISocialMedia };
