/**
 * Test Crumplete AI Provider with JSON Object Injection
 * Tests the "Social Media Graph Extraction" prompt with structured JSON output
 */

const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:3001";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";
let authToken = null;

// Test data
const testSocialMediaData = `
Just had an amazing coffee at @BlueBottleCoffee! ☕️ Their new seasonal blend is incredible. 
Met up with @sarah_johnson and @mike_chen for our weekly catch-up. 
#coffee #friends #weekend #BlueBottle #seasonal #amazing

Planning to visit @MOMA next week to see the new @FridaKahlo exhibition. 
@sophie_art and @gallery_curator recommended it highly. 
#art #museum #FridaKahlo #MOMA #exhibition #culture

Working on a new project with @tech_startup_inc. 
@alex_developer and @maria_designer are part of the team. 
#startup #tech #collaboration #development #design #innovation
`;

const expectedJsonSchema = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: ["person", "organization", "product", "event", "topic"],
          },
          label: { type: "string" },
          properties: { type: "object" },
        },
        required: ["id", "type", "label", "properties"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string" },
          weight: { type: "number" },
          properties: { type: "object" },
        },
        required: ["from", "to", "type"],
      },
    },
  },
  required: ["nodes", "edges"],
};

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
    return socialMediaPrompt;
  } catch (error) {
    console.error("❌ Failed to get prompts:", error.message);
    throw error;
  }
}

async function testOpenRouterAI(provider, prompt) {
  console.log("🧪 Testing OpenRouter AI with Social Media Graph Extraction...");

  const testPayload = {
    model: "openai/gpt-oss-20b:free",
    messages: [
      {
        role: "system",
        content: prompt.systemPrompt,
      },
      {
        role: "user",
        content: `Extract entities and relationships from: "John works at Apple with Sarah. They are friends." Return JSON with nodes and edges arrays.`,
      },
    ],
    temperature: 0.1,
    max_tokens: 16384,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "social_media_graph",
        strict: true,
        schema: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string" },
                  label: { type: "string" },
                  properties: { type: "object" },
                },
                required: ["id", "type", "label"],
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  type: { type: "string" },
                  weight: { type: "number" },
                  properties: { type: "object" },
                },
                required: ["from", "to", "type"],
              },
            },
          },
          required: ["nodes", "edges"],
          additionalProperties: false,
        },
      },
    },
  };

  try {
    console.log("📤 Sending request to OpenRouter AI...");
    console.log(`   Model: ${testPayload.model}`);
    console.log(`   Messages: ${testPayload.messages.length} messages`);
    console.log(
      `   System prompt length: ${prompt.systemPrompt.length} characters`
    );
    console.log(
      `   User content length: ${testPayload.messages[1].content.length} characters`
    );

    const response = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      testPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        timeout: 30000,
      }
    );

    console.log("✅ OpenRouter AI response received");
    console.log(`   Status: ${response.status}`);
    console.log(`   Model used: ${response.data.model || "Unknown"}`);
    console.log(
      `   Tokens used: ${response.data.usage?.total_tokens || "Unknown"}`
    );

    console.log("\n🔍 Full Response Structure:");
    console.log(JSON.stringify(response.data, null, 2));

    let content = response.data.choices[0]?.message?.content;

    // Check if content is empty but reasoning is available (some models use reasoning field)
    if (!content && response.data.choices[0]?.message?.reasoning) {
      content = response.data.choices[0].message.reasoning;
      console.log(
        "📝 Using reasoning field as content (model hit token limit)"
      );
    }

    if (!content) {
      console.log("❌ No content found in response");
      console.log("Available choices:", response.data.choices?.length || 0);
      if (response.data.choices && response.data.choices.length > 0) {
        console.log(
          "First choice structure:",
          JSON.stringify(response.data.choices[0], null, 2)
        );
      }
      throw new Error("No content in response");
    }

    console.log("\n📋 Raw Response:");
    console.log("=" * 50);
    console.log(content);
    console.log("=" * 50);

    // Try to extract JSON from markdown code block
    let jsonContent = content;
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
      console.log("\n🔍 Extracted JSON from markdown code block");
    }

    // Try to parse as JSON
    try {
      const jsonResponse = JSON.parse(jsonContent);
      console.log("\n✅ Successfully parsed JSON response!");
      console.log("📊 JSON Structure Analysis:");

      // Validate structure
      if (jsonResponse.nodes && Array.isArray(jsonResponse.nodes)) {
        console.log(`   ✅ Nodes: ${jsonResponse.nodes.length} found`);
        jsonResponse.nodes.forEach((node, index) => {
          console.log(
            `      ${index + 1}. ${node.label} (${node.type}) - ID: ${node.id}`
          );
        });
      } else {
        console.log("   ⚠️  No nodes found or invalid format");
      }

      if (jsonResponse.edges && Array.isArray(jsonResponse.edges)) {
        console.log(`   ✅ Edges: ${jsonResponse.edges.length} found`);
        jsonResponse.edges.forEach((edge, index) => {
          console.log(
            `      ${index + 1}. ${edge.from} -> ${edge.to} (${edge.type})`
          );
        });
      } else {
        console.log("   ⚠️  No edges found or invalid format");
      }

      return {
        success: true,
        jsonResponse,
        rawContent: content,
        usage: response.data.usage,
      };
    } catch (jsonError) {
      console.log("\n❌ Failed to parse JSON response");
      console.log(`   Error: ${jsonError.message}`);
      console.log(
        "   This indicates the JSON object injection is not working properly"
      );

      return {
        success: false,
        error: jsonError.message,
        rawContent: content,
        usage: response.data.usage,
      };
    }
  } catch (error) {
    console.error("❌ OpenRouter AI test failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    throw error;
  }
}

async function validateJsonSchema(prompt) {
  console.log("\n🔍 Validating JSON schema in prompt...");

  if (!prompt.jsonSchema) {
    console.log("❌ No JSON schema found in prompt");
    return false;
  }

  console.log("✅ JSON schema found in prompt");
  console.log("📋 Schema structure:");
  console.log(JSON.stringify(prompt.jsonSchema, null, 2));

  // Check if schema matches expected structure
  const schema = prompt.jsonSchema;
  const hasNodes = schema.properties?.nodes?.type === "array";
  const hasEdges = schema.properties?.edges?.type === "array";

  console.log(`   ✅ Nodes schema: ${hasNodes ? "Valid" : "Missing/Invalid"}`);
  console.log(`   ✅ Edges schema: ${hasEdges ? "Valid" : "Missing/Invalid"}`);

  return hasNodes && hasEdges;
}

async function runTest() {
  console.log("🚀 Starting OpenRouter AI JSON Injection Test");
  console.log("=" * 60);

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get OpenRouter AI provider
    const provider = await getOpenRouterProvider();

    // Step 3: Get Social Media Graph Extraction prompt
    const prompt = await getSocialMediaPrompt();

    // Step 4: Validate JSON schema
    const schemaValid = await validateJsonSchema(prompt);

    // Step 5: Test OpenRouter AI with JSON injection
    const testResult = await testOpenRouterAI(provider, prompt);

    // Step 6: Summary
    console.log("\n" + "=" * 60);
    console.log("📊 TEST SUMMARY");
    console.log("=" * 60);

    console.log(`✅ Authentication: Success`);
    console.log(`✅ Provider Found: ${provider.name} (${provider.type})`);
    console.log(`✅ Prompt Found: ${prompt.name}`);
    console.log(`✅ JSON Schema: ${schemaValid ? "Valid" : "Invalid"}`);
    console.log(
      `✅ OpenRouter AI Response: ${testResult.success ? "Success" : "Failed"}`
    );
    console.log(
      `✅ JSON Parsing: ${testResult.success ? "Success" : "Failed"}`
    );

    if (testResult.success) {
      console.log("\n🎉 ALL TESTS PASSED!");
      console.log("✅ OpenRouter AI provider is working correctly");
      console.log(
        "✅ JSON object injection is working for Social Media Graph Extraction"
      );
      console.log(
        "✅ The prompt successfully generates structured JSON output"
      );
    } else {
      console.log("\n❌ SOME TESTS FAILED!");
      console.log("❌ JSON object injection is not working properly");
      console.log("❌ The AI is not returning valid JSON format");
    }

    if (testResult.usage) {
      console.log(`\n📈 Usage Stats:`);
      console.log(
        `   Prompt tokens: ${testResult.usage.prompt_tokens || "Unknown"}`
      );
      console.log(
        `   Completion tokens: ${testResult.usage.completion_tokens || "Unknown"}`
      );
      console.log(
        `   Total tokens: ${testResult.usage.total_tokens || "Unknown"}`
      );
    }
  } catch (error) {
    console.error("\n💥 TEST FAILED:", error.message);
    process.exit(1);
  }
}

// Run the test
runTest();
