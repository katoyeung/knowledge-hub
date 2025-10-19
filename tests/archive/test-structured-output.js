const axios = require("axios");

// Test structured output with different LLM providers
async function testStructuredOutput() {
  const baseUrl = "http://localhost:3001";

  // Test schema for structured output
  const testSchema = {
    type: "object",
    properties: {
      language: { type: "string" },
      algorithm: { type: "string" },
      code: { type: "string" },
      time_complexity: { type: "string" },
    },
    required: ["language", "algorithm", "code"],
  };

  const testMessage =
    "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity";

  console.log("🧪 Testing Structured Output Support\n");
  console.log("Test Schema:", JSON.stringify(testSchema, null, 2));
  console.log("Test Message:", testMessage);
  console.log("\n" + "=".repeat(80) + "\n");

  // Test different providers
  const providers = [
    { name: "OpenAI", type: "openai", model: "gpt-4" },
    { name: "Perplexity", type: "perplexity", model: "sonar" },
    { name: "DashScope", type: "dashscope", model: "qwen3-max" },
    { name: "Ollama", type: "custom", model: "llama3.1:8b" },
  ];

  for (const provider of providers) {
    console.log(`\n🔍 Testing ${provider.name} (${provider.type})`);
    console.log("-".repeat(50));

    try {
      // First, get available AI providers
      const providersResponse = await axios.get(`${baseUrl}/api/ai-providers`);
      const aiProviders = providersResponse.data.data || providersResponse.data;

      // Find the provider we want to test
      const targetProvider = aiProviders.find((p) => p.type === provider.type);

      if (!targetProvider) {
        console.log(
          `❌ Provider ${provider.type} not found in available providers`
        );
        continue;
      }

      console.log(
        `✅ Found provider: ${targetProvider.name} (${targetProvider.type})`
      );
      console.log(`📊 Available: ${targetProvider.available ? "Yes" : "No"}`);

      if (!targetProvider.available) {
        console.log(
          `⚠️  Provider not available: ${targetProvider.availabilityMessage || "Unknown reason"}`
        );
        continue;
      }

      // Test structured output
      const testPayload = {
        messages: [{ role: "user", content: testMessage }],
        model: provider.model,
        jsonSchema: testSchema,
        temperature: 0.7,
      };

      console.log(`🚀 Sending request to ${provider.name}...`);
      const startTime = Date.now();

      const response = await axios.post(
        `${baseUrl}/api/ai-providers/${targetProvider.id}/chat-completion`,
        testPayload,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Response received in ${duration}ms`);

      const content = response.data.choices?.[0]?.message?.content;
      if (content) {
        console.log(`📝 Response content:`);
        console.log(content);

        // Try to parse as JSON to verify structure
        try {
          const parsed = JSON.parse(content);
          console.log(`✅ Valid JSON structure received:`);
          console.log(JSON.stringify(parsed, null, 2));

          // Check if required fields are present
          const requiredFields = testSchema.required || [];
          const missingFields = requiredFields.filter(
            (field) => !(field in parsed)
          );

          if (missingFields.length === 0) {
            console.log(
              `✅ All required fields present: ${requiredFields.join(", ")}`
            );
          } else {
            console.log(
              `⚠️  Missing required fields: ${missingFields.join(", ")}`
            );
          }
        } catch (parseError) {
          console.log(`❌ Response is not valid JSON: ${parseError.message}`);
        }
      } else {
        console.log(`❌ No content in response`);
      }
    } catch (error) {
      console.log(`❌ Error testing ${provider.name}:`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(
          `   Message: ${error.response.data?.message || error.response.statusText}`
        );
      } else {
        console.log(`   ${error.message}`);
      }
    }

    console.log(""); // Empty line for readability
  }

  console.log("\n" + "=".repeat(80));
  console.log("🏁 Structured Output Testing Complete");
}

// Run the test
testStructuredOutput().catch(console.error);
