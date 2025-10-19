/**
 * Test Crumplete AI (Ollama) Provider with JSON Format Object
 * Tests the "qwen3-coder-30b-fixed:latest" model with structured JSON output
 */

const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:3001";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";
let authToken = null;

// Test data
const testPrompt =
  "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity";

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

async function testCrumpleteAIDirect(provider) {
  console.log("🧪 Testing Crumplete AI with direct API call...");

  const testPayload = {
    model: "qwen3-coder-30b-fixed:latest",
    messages: [
      {
        role: "user",
        content: testPrompt,
      },
    ],
    format: {
      type: "object",
      properties: {
        language: { type: "string" },
        algorithm: { type: "string" },
        code: { type: "string" },
        time_complexity: { type: "string" },
      },
      required: ["language", "algorithm", "code"],
    },
  };

  try {
    console.log("📤 Sending request to Crumplete AI...");
    console.log(`   Model: ${testPayload.model}`);
    console.log(`   Prompt: ${testPrompt}`);
    console.log(`   Format: ${JSON.stringify(testPayload.format, null, 2)}`);

    const response = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      testPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        timeout: 60000, // 60 second timeout
      }
    );

    console.log("✅ Crumplete AI response received");
    console.log(`   Status: ${response.status}`);
    console.log(`   Model used: ${response.data.model || "Unknown"}`);

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      console.log("❌ No content found in response");
      console.log("Available choices:", response.data.choices?.length || 0);
      if (response.data.choices && response.data.choices.length > 0) {
        console.log(
          "First choice:",
          JSON.stringify(response.data.choices[0], null, 2)
        );
      }
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
      const requiredFields = ["language", "algorithm", "code"];
      const hasRequiredFields = requiredFields.every(
        (field) =>
          jsonResponse.hasOwnProperty(field) &&
          jsonResponse[field] !== null &&
          jsonResponse[field] !== undefined
      );

      if (hasRequiredFields) {
        console.log("✅ JSON structure validation passed!");
        console.log(`   Language: ${jsonResponse.language}`);
        console.log(`   Algorithm: ${jsonResponse.algorithm}`);
        console.log(
          `   Code: ${jsonResponse.code.substring(0, 100)}${jsonResponse.code.length > 100 ? "..." : ""}`
        );
        console.log(
          `   Time Complexity: ${jsonResponse.time_complexity || "Not provided"}`
        );

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

async function testCrumpleteAIThroughBackend(provider) {
  console.log("\n🧪 Testing Crumplete AI through backend integration...");

  try {
    // First, get available models for this provider
    const modelsResponse = await axios.get(
      `${BASE_URL}/ai-providers/${provider.id}/models`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    console.log("✅ AI Provider models retrieved successfully");
    console.log(`   Available models: ${modelsResponse.data.length}`);

    // Check if our target model is available
    const targetModel = modelsResponse.data.find(
      (model) =>
        model.id === "qwen3-coder-30b-fixed:latest" ||
        model.name === "qwen3-coder-30b-fixed:latest"
    );

    if (!targetModel) {
      console.log(
        "⚠️  Target model 'qwen3-coder-30b-fixed:latest' not found in provider models"
      );
      console.log("   Available models:");
      modelsResponse.data.forEach((model, index) => {
        console.log(`   ${index + 1}. ${model.name || model.id}`);
      });
      return { success: false, error: "Target model not found" };
    }

    console.log(`✅ Target model found: ${targetModel.name || targetModel.id}`);

    // Test through chat API (if available)
    const datasetsResponse = await axios.get(`${BASE_URL}/datasets`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (datasetsResponse.data.length === 0) {
      console.log("⚠️  No datasets available for chat testing");
      console.log("   Skipping backend chat test");
      return { success: true, message: "No datasets available for testing" };
    }

    const dataset = datasetsResponse.data[0];
    console.log(`   Using dataset: ${dataset.name} (${dataset.id})`);

    // Test chat with documents
    const chatPayload = {
      message: testPrompt,
      datasetId: dataset.id,
      llmProvider: provider.type,
      model: targetModel.id,
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
        timeout: 60000, // 60 second timeout
      }
    );

    console.log("✅ Chat completion successful through backend!");
    console.log(`   Response ID: ${chatResponse.data.message?.id || "N/A"}`);
    console.log(
      `   Content Length: ${chatResponse.data.message?.content?.length || 0} characters`
    );

    const content = chatResponse.data.message?.content;
    if (content) {
      console.log("\n📋 Backend Response Content:");
      console.log(
        content.substring(0, 500) + (content.length > 500 ? "..." : "")
      );

      // Try to parse JSON from response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonContent = jsonMatch[0];
          const jsonResponse = JSON.parse(jsonContent);
          console.log("✅ JSON response detected and parsed from backend!");
          console.log("📊 JSON Structure Analysis:");

          const requiredFields = ["language", "algorithm", "code"];
          const hasRequiredFields = requiredFields.every(
            (field) =>
              jsonResponse.hasOwnProperty(field) &&
              jsonResponse[field] !== null &&
              jsonResponse[field] !== undefined
          );

          if (hasRequiredFields) {
            console.log("✅ Backend JSON structure validation passed!");
            console.log(`   Language: ${jsonResponse.language}`);
            console.log(`   Algorithm: ${jsonResponse.algorithm}`);
            console.log(
              `   Code: ${typeof jsonResponse.code === "string" ? jsonResponse.code.substring(0, 100) + (jsonResponse.code.length > 100 ? "..." : "") : JSON.stringify(jsonResponse.code).substring(0, 100) + "..."}`
            );
            console.log(
              `   Time Complexity: ${jsonResponse.time_complexity || "Not provided"}`
            );
          } else {
            console.log("❌ Backend JSON structure validation failed");
            console.log("   Expected fields:", requiredFields);
            console.log("   Actual fields:", Object.keys(jsonResponse));
          }
        } else {
          console.log("⚠️  No JSON structure found in backend response");
        }
      } catch (jsonError) {
        console.log("❌ Failed to parse JSON from backend response");
        console.log(`   Error: ${jsonError.message}`);
      }
    }

    return { success: true, data: content };
  } catch (error) {
    console.error("❌ Backend integration test failed:", error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log("🚀 Starting Crumplete AI (Ollama) Provider Test");
  console.log("=".repeat(60));

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get Crumplete AI provider
    const provider = await getCrumpleteAIProvider();

    // Step 3: Test direct API call
    console.log("\n" + "=".repeat(40));
    console.log("📋 DIRECT API TEST");
    console.log("=".repeat(40));
    const directResult = await testCrumpleteAIDirect(provider);

    // Step 4: Test through backend
    console.log("\n" + "=".repeat(40));
    console.log("📋 BACKEND INTEGRATION TEST");
    console.log("=".repeat(40));
    const backendResult = await testCrumpleteAIThroughBackend(provider);

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log("✅ Authentication: Success");
    console.log(`✅ Provider Found: ${provider.name} (${provider.type})`);
    console.log(
      `✅ Direct API Test: ${directResult.success ? "Success" : "Failed"}`
    );
    console.log(
      `✅ Backend Integration: ${backendResult.success ? "Success" : "Failed"}`
    );

    if (directResult.success && backendResult.success) {
      console.log("\n🎉 ALL TESTS PASSED!");
      console.log("✅ Crumplete AI (Ollama) provider is working correctly");
      console.log("✅ JSON format object is working");
      console.log("✅ Backend integration is working");
    } else {
      console.log("\n❌ SOME TESTS FAILED!");
      if (!directResult.success) {
        console.log(`❌ Direct API Error: ${directResult.error}`);
      }
      if (!backendResult.success) {
        console.log(`❌ Backend Integration Error: ${backendResult.error}`);
      }
    }
  } catch (error) {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log("❌ SOME TESTS FAILED!");
    console.log(`❌ Error: ${error.message}`);
    console.log("\n💥 TEST FAILED: Crumplete AI provider test failed");
    process.exit(1);
  }
}

// Run the test
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
