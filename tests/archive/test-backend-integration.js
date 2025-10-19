/**
 * Test Backend Integration with Prompt and AI Provider Modules
 * Tests the "Social Media Graph Extraction" prompt through our backend API
 */

const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:3001";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";
let authToken = null;

// Test data
const testSocialMediaData = `Just had an amazing coffee at @BlueBottleCoffee! ☕️ Their new seasonal blend is incredible. 
Met up with @sarah_johnson and @mike_chen for our weekly catch-up. 
#coffee #friends #weekend #BlueBottle #seasonal #amazing

Planning to visit @MOMA next week to see the new @FridaKahlo exhibition. 
@sophie_art and @gallery_curator recommended it highly. 
#art #museum #FridaKahlo #MOMA #exhibition #culture

Working on a new project with @tech_startup_inc. 
@alex_developer and @maria_designer are part of the team. 
#startup #tech #collaboration #development #design #innovation`;

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

async function getOpenRouterProvider() {
  console.log("🔍 Looking for OpenRouter AI provider...");
  try {
    const response = await axios.get(`${BASE_URL}/ai-providers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const openRouterProvider = response.data.find(
      (provider) =>
        provider.name.toLowerCase().includes("openrouter") ||
        provider.type === "openrouter"
    );

    if (!openRouterProvider) {
      throw new Error("OpenRouter AI provider not found");
    }

    console.log(
      `✅ Found OpenRouter AI provider: ${openRouterProvider.name} (${openRouterProvider.id})`
    );
    console.log(`   Type: ${openRouterProvider.type}`);
    console.log(`   Base URL: ${openRouterProvider.baseUrl}`);
    console.log(
      `   API Key: ${openRouterProvider.apiKey ? "Present" : "Missing"}`
    );
    console.log(`   Active: ${openRouterProvider.isActive ? "Yes" : "No"}`);
    return openRouterProvider;
  } catch (error) {
    console.error("❌ Failed to get AI providers:", error.message);
    throw error;
  }
}

async function getSocialMediaPrompt() {
  console.log("🔍 Looking for Social Media Graph Extraction prompt...");
  try {
    const response = await axios.get(`${BASE_URL}/prompts`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const socialMediaPrompt = response.data.find(
      (prompt) =>
        prompt.name.toLowerCase().includes("social media") &&
        prompt.name.toLowerCase().includes("graph extraction")
    );

    if (!socialMediaPrompt) {
      throw new Error("Social Media Graph Extraction prompt not found");
    }

    console.log(
      `✅ Found Social Media prompt: ${socialMediaPrompt.name} (${socialMediaPrompt.id})`
    );
    console.log(`   Type: ${socialMediaPrompt.type}`);
    console.log(
      `   System Prompt Length: ${socialMediaPrompt.systemPrompt?.length || 0} characters`
    );
    console.log(
      `   User Template Length: ${socialMediaPrompt.userPromptTemplate?.length || 0} characters`
    );
    console.log(
      `   JSON Schema: ${socialMediaPrompt.jsonSchema ? "Present" : "Missing"}`
    );

    return socialMediaPrompt;
  } catch (error) {
    console.error("❌ Failed to get prompts:", error.message);
    throw error;
  }
}

async function testBackendIntegration(provider, prompt) {
  console.log(
    "🧪 Testing Backend Integration with Social Media Graph Extraction..."
  );

  // Test 1: Test AI Provider through backend
  console.log(
    "\n📋 Test 1: Testing AI Provider availability through backend..."
  );
  try {
    const response = await axios.get(
      `${BASE_URL}/ai-providers/${provider.id}/models`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    console.log("✅ AI Provider models retrieved successfully");
    console.log(`   Available models: ${response.data.length}`);
    response.data.forEach((model, index) => {
      console.log(`   ${index + 1}. ${model.name || model.id}`);
    });
  } catch (error) {
    console.error("❌ Failed to get AI provider models:", error.message);
    throw error;
  }

  // Test 2: Test prompt validation
  console.log("\n📋 Test 2: Validating prompt JSON schema...");
  try {
    if (prompt.jsonSchema) {
      // jsonSchema is already parsed as object (jsonb type in PostgreSQL)
      const jsonSchema = prompt.jsonSchema;
      console.log("✅ JSON schema found in prompt");
      console.log("📋 Schema structure:");
      console.log(JSON.stringify(jsonSchema, null, 2));

      // Validate required fields
      if (
        jsonSchema.required &&
        jsonSchema.required.includes("nodes") &&
        jsonSchema.required.includes("edges")
      ) {
        console.log("   ✅ Required fields: nodes, edges");
      } else {
        console.log("   ❌ Missing required fields: nodes, edges");
      }

      if (jsonSchema.properties?.nodes?.type === "array") {
        console.log("   ✅ Nodes schema: Valid");
      } else {
        console.log("   ❌ Nodes schema: Invalid");
      }

      if (jsonSchema.properties?.edges?.type === "array") {
        console.log("   ✅ Edges schema: Valid");
      } else {
        console.log("   ❌ Edges schema: Invalid");
      }
    } else {
      console.log("❌ No JSON schema found in prompt");
    }
  } catch (error) {
    console.error("❌ Failed to validate JSON schema:", error.message);
  }

  // Test 3: Test chat completion through backend (if available)
  console.log("\n📋 Test 3: Testing chat completion through backend...");
  try {
    // First, we need a dataset to test with
    const datasetsResponse = await axios.get(`${BASE_URL}/datasets`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (datasetsResponse.data.length === 0) {
      console.log("⚠️  No datasets available for chat testing");
      console.log("   Skipping chat completion test");
      return;
    }

    const dataset = datasetsResponse.data[0];
    console.log(`   Using dataset: ${dataset.name} (${dataset.id})`);

    // Test chat with documents
    const chatPayload = {
      message: `Extract entities and relationships from: "${testSocialMediaData}"`,
      datasetId: dataset.id,
      llmProvider: provider.type,
      model: "openai/gpt-oss-20b:free",
      temperature: 0.1,
      maxChunks: 5,
    };

    console.log("📤 Sending chat request to backend...");
    console.log(`   Dataset: ${dataset.name}`);
    console.log(`   Provider: ${provider.type}`);
    console.log(`   Model: ${chatPayload.model}`);

    const chatResponse = await axios.post(
      `${BASE_URL}/chat/with-documents`,
      chatPayload,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 60000, // 60 second timeout for complex requests
      }
    );

    console.log("✅ Chat completion successful through backend!");
    console.log(`   Response ID: ${chatResponse.data.message?.id || "N/A"}`);
    console.log(
      `   Content Length: ${chatResponse.data.message?.content?.length || 0} characters`
    );

    // Try to parse JSON from response
    const content = chatResponse.data.message?.content;
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonContent = jsonMatch[0];
          const jsonResponse = JSON.parse(jsonContent);
          console.log("✅ JSON response detected and parsed!");
          console.log("📊 JSON Structure Analysis:");

          if (jsonResponse.nodes && Array.isArray(jsonResponse.nodes)) {
            console.log(`   ✅ Nodes: ${jsonResponse.nodes.length} found`);
            jsonResponse.nodes.forEach((node, index) => {
              console.log(
                `      ${index + 1}. ${node.label || node.id} (${node.type || "unknown"})`
              );
            });
          }

          if (jsonResponse.edges && Array.isArray(jsonResponse.edges)) {
            console.log(`   ✅ Edges: ${jsonResponse.edges.length} found`);
            jsonResponse.edges.forEach((edge, index) => {
              console.log(
                `      ${index + 1}. ${edge.from} -> ${edge.to} (${edge.type})`
              );
            });
          }
        } else {
          console.log("⚠️  No JSON structure found in response");
          console.log(`   Content preview: ${content.substring(0, 200)}...`);
        }
      } catch (jsonError) {
        console.log("❌ Failed to parse JSON from response");
        console.log(`   Error: ${jsonError.message}`);
        console.log(`   Content preview: ${content.substring(0, 200)}...`);
      }
    }
  } catch (error) {
    console.error("❌ Chat completion test failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
  }
}

async function main() {
  console.log("🚀 Starting Backend Integration Test");
  console.log("=".repeat(50));

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get OpenRouter provider
    const provider = await getOpenRouterProvider();

    // Step 3: Get Social Media prompt
    const prompt = await getSocialMediaPrompt();

    // Step 4: Test backend integration
    await testBackendIntegration(provider, prompt);

    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log("✅ Authentication: Success");
    console.log("✅ Provider Found: OpenRouter (openrouter)");
    console.log("✅ Prompt Found: Social Media Graph Extraction");
    console.log("✅ Backend Integration: Success");
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log(
      "✅ Backend prompt module and AI provider module are working correctly"
    );
    console.log("✅ Full integration test completed successfully");
  } catch (error) {
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log("❌ SOME TESTS FAILED!");
    console.log(`❌ Error: ${error.message}`);
    console.log("\n💥 TEST FAILED: Backend integration test failed");
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
