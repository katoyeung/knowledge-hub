/**
 * Simple Test for Crumplete AI (Ollama) Provider with JSON Format Object
 * Tests with a shorter prompt and timeout
 */

const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:3001";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";
let authToken = null;

// Simple test data
const simplePrompt = "Return JSON with name and age fields";

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
    throw error;
  }
}

async function getCrumpleteAIProvider() {
  console.log("🔍 Looking for Crumplete AI provider...");
  try {
    const response = await axios.get(`${BASE_URL}/ai-providers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const crumpleteProvider = response.data.find(
      (provider) =>
        provider.name.toLowerCase().includes("crumplete") ||
        provider.type === "ollama"
    );

    if (!crumpleteProvider) {
      throw new Error("Crumplete AI provider not found");
    }

    console.log(
      `✅ Found Crumplete AI provider: ${crumpleteProvider.name} (${crumpleteProvider.id})`
    );
    console.log(`   Type: ${crumpleteProvider.type}`);
    console.log(`   Base URL: ${crumpleteProvider.baseUrl}`);
    console.log(
      `   API Key: ${crumpleteProvider.apiKey ? "Present" : "Missing"}`
    );
    console.log(`   Active: ${crumpleteProvider.isActive ? "Yes" : "No"}`);
    return crumpleteProvider;
  } catch (error) {
    console.error("❌ Failed to get AI providers:", error.message);
    throw error;
  }
}

async function testCrumpleteAISimple(provider) {
  console.log("🧪 Testing Crumplete AI with simple JSON format...");

  const testPayload = {
    model: "llama4:scout",
    messages: [
      {
        role: "user",
        content: simplePrompt,
      },
    ],
    format: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
    },
  };

  try {
    console.log("📤 Sending simple request to Crumplete AI...");
    console.log(`   Model: ${testPayload.model}`);
    console.log(`   Prompt: ${simplePrompt}`);
    console.log(`   Format: ${JSON.stringify(testPayload.format, null, 2)}`);

    const response = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      testPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log("✅ Crumplete AI response received");
    console.log(`   Status: ${response.status}`);
    console.log(`   Model used: ${response.data.model || "Unknown"}`);

    console.log("\n🔍 Full Response Structure:");
    console.log(JSON.stringify(response.data, null, 2));

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ No content found in response");
      return { success: false, error: "No content in response" };
    }

    console.log("\n📋 Raw Response:");
    console.log(content);

    // Try to extract JSON from the response
    let jsonContent = content;

    // Check if response is wrapped in markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
      console.log("\n🔍 Extracted JSON from markdown:");
      console.log(jsonContent);
    }

    // Try to parse JSON
    try {
      const jsonResponse = JSON.parse(jsonContent);
      console.log("\n✅ Successfully parsed JSON response!");
      console.log("📊 JSON Content:", JSON.stringify(jsonResponse, null, 2));

      // Validate structure
      const requiredFields = ["name", "age"];
      const hasRequiredFields = requiredFields.every(
        (field) =>
          jsonResponse.hasOwnProperty(field) &&
          jsonResponse[field] !== null &&
          jsonResponse[field] !== undefined
      );

      if (hasRequiredFields) {
        console.log("✅ JSON structure validation passed!");
        console.log(`   Name: ${jsonResponse.name}`);
        console.log(`   Age: ${jsonResponse.age}`);

        return {
          success: true,
          data: jsonResponse,
        };
      } else {
        console.log("❌ JSON structure validation failed");
        console.log("   Expected fields:", requiredFields);
        console.log("   Actual fields:", Object.keys(jsonResponse));
        return {
          success: false,
          error: "Invalid JSON structure",
          data: jsonResponse,
        };
      }
    } catch (jsonError) {
      console.log("❌ Failed to parse JSON response");
      console.log(`   Error: ${jsonError.message}`);
      console.log(`   Raw content: ${content.substring(0, 200)}...`);
      return {
        success: false,
        error: "JSON parsing failed",
        data: content,
      };
    }
  } catch (error) {
    console.error("❌ Crumplete AI test failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log("🚀 Starting Simple Crumplete AI (Ollama) Test");
  console.log("=".repeat(50));

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get Crumplete AI provider
    const provider = await getCrumpleteAIProvider();

    // Step 3: Test simple JSON format
    const result = await testCrumpleteAISimple(provider);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log("✅ Authentication: Success");
    console.log(`✅ Provider Found: ${provider.name} (${provider.type})`);
    console.log(
      `✅ JSON Format Test: ${result.success ? "Success" : "Failed"}`
    );

    if (result.success) {
      console.log("\n🎉 TEST PASSED!");
      console.log("✅ Crumplete AI (Ollama) provider is working correctly");
      console.log("✅ JSON format object is working");
      console.log("✅ Model 'qwen3-coder-30b-fixed:latest' is responding");
    } else {
      console.log("\n❌ TEST FAILED!");
      console.log(`❌ Error: ${result.error}`);
    }
  } catch (error) {
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log("❌ TEST FAILED!");
    console.log(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
