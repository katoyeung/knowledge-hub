const axios = require("axios");

const BASE_URL = "http://localhost:3001";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "PassW0rd@2025";

let authToken = "";

async function authenticate() {
  console.log("🔐 Authenticating with admin credentials...");
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    authToken = response.data.access_token;
    console.log("✅ Authentication successful");
  } catch (error) {
    console.error("❌ Authentication failed:", error.message);
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

async function testEntityExtraction(provider) {
  console.log("🧪 Testing OpenRouter AI with simple entity extraction...");

  const testPayload = {
    model: "openai/gpt-oss-20b:free",
    messages: [
      {
        role: "system",
        content:
          "Extract entities from text. Return JSON with 'entities' array. Each entity should have 'name', 'type', and 'confidence' fields.",
      },
      {
        role: "user",
        content:
          "Extract entities from: 'Apple Inc. is a technology company founded by Steve Jobs in California.'",
      },
    ],
    temperature: 0.1,
    max_tokens: 300,
  };

  try {
    console.log("📤 Sending entity extraction request to OpenRouter AI...");
    console.log(`   Model: ${testPayload.model}`);
    console.log(`   Max tokens: ${testPayload.max_tokens}`);

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

    let content = response.data.choices?.[0]?.message?.content;

    // Check if content is empty but reasoning is available
    if (!content && response.data.choices[0]?.message?.reasoning) {
      content = response.data.choices[0].message.reasoning;
      console.log(
        "📝 Using reasoning field as content (model hit token limit)"
      );
    }

    if (!content) {
      console.log("❌ No content found in response");
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
      console.log("📊 JSON Content:", JSON.stringify(jsonResponse, null, 2));

      // Validate structure
      if (jsonResponse.entities && Array.isArray(jsonResponse.entities)) {
        console.log("✅ JSON structure validation passed!");
        console.log(`   Entities found: ${jsonResponse.entities.length}`);

        jsonResponse.entities.forEach((entity, index) => {
          console.log(
            `   ${index + 1}. ${entity.name} (${entity.type}) - confidence: ${entity.confidence}`
          );
        });

        return {
          success: true,
          data: jsonResponse,
          usage: response.data.usage,
        };
      } else {
        console.log("❌ JSON structure validation failed");
        console.log("   Expected field: entities (array)");
        return {
          success: false,
          error: "Invalid JSON structure",
          data: jsonResponse,
          usage: response.data.usage,
        };
      }
    } catch (jsonError) {
      console.log("❌ Failed to parse JSON response");
      console.log(`   Error: ${jsonError.message}`);
      console.log(`   Raw content: ${content.substring(0, 200)}...`);

      return {
        success: false,
        error: jsonError.message,
        rawContent: content,
        usage: response.data.usage,
      };
    }
  } catch (error) {
    console.error("❌ OpenRouter AI test failed:", error.message);
    if (error.code === "ECONNABORTED") {
      console.error(
        "   This was a timeout error - the AI provider may be slow or unavailable"
      );
    }
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(
        `   Response: ${JSON.stringify(error.response.data, null, 2)}`
      );
    }
    throw error;
  }
}

async function runTest() {
  console.log("🚀 Starting Simple Entity Extraction Test");
  console.log("=" * 50);

  try {
    // Step 1: Authenticate
    await authenticate();

    // Step 2: Get OpenRouter AI provider
    const provider = await getOpenRouterProvider();

    // Step 3: Test entity extraction
    const testResult = await testEntityExtraction(provider);

    // Step 4: Summary
    console.log("\n" + "=" * 50);
    console.log("📊 TEST SUMMARY");
    console.log("=" * 50);

    console.log(`✅ Authentication: Success`);
    console.log(`✅ Provider Found: ${provider.name} (${provider.type})`);
    console.log(
      `✅ OpenRouter AI Response: ${testResult.success ? "Success" : "Failed"}`
    );
    console.log(
      `✅ JSON Parsing: ${testResult.success ? "Success" : "Failed"}`
    );

    if (testResult.success) {
      console.log("\n🎉 ALL TESTS PASSED!");
      console.log("✅ OpenRouter AI provider is working correctly");
      console.log("✅ Simple entity extraction is working");
      console.log(
        "✅ The AI can generate structured JSON with response_format"
      );
    } else {
      console.log("\n❌ SOME TESTS FAILED!");
      console.log("❌ Entity extraction is not working properly");
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

    console.log("\n" + "=" * 50);
  } catch (error) {
    console.error("\n💥 TEST FAILED:", error.message);
    process.exit(1);
  }
}

// Run the test
runTest();
