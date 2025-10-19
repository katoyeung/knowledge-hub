/**
 * Example: Using Structured Output with Prompts
 *
 * This example demonstrates how to use structured output with different
 * LLM providers when the JSON schema comes from a prompt module.
 */

const axios = require("axios");

const BASE_URL = "http://localhost:3001";

// Example 1: Create a prompt with structured output schema
async function createPromptWithSchema() {
  console.log("📝 Example 1: Creating Prompt with Structured Output Schema\n");

  const promptData = {
    name: "Algorithm Explanation Prompt",
    systemPrompt:
      "You are an expert computer science tutor. Explain algorithms clearly and provide code examples.",
    userPromptTemplate:
      "Explain the {{algorithm}} algorithm in {{language}} and provide a complete example.",
    description: "Prompt for explaining algorithms with structured output",
    type: "intention",
    jsonSchema: {
      // OpenAI format
      name: "algorithm_explanation",
      strict: true,
      schema: {
        type: "object",
        properties: {
          algorithm_name: {
            type: "string",
            description: "Name of the algorithm",
          },
          description: {
            type: "string",
            description: "Clear explanation of how the algorithm works",
          },
          time_complexity: {
            type: "string",
            description: "Time complexity in Big O notation",
          },
          space_complexity: {
            type: "string",
            description: "Space complexity in Big O notation",
          },
          code_example: {
            type: "string",
            description: "Complete code implementation",
          },
          use_cases: {
            type: "array",
            items: { type: "string" },
            description: "Common use cases for this algorithm",
          },
        },
        required: [
          "algorithm_name",
          "description",
          "time_complexity",
          "code_example",
        ],
        additionalProperties: false,
      },
    },
    isGlobal: false,
    isActive: true,
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/prompts`, promptData, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("✅ Prompt created successfully:");
    console.log(`ID: ${response.data.id}`);
    console.log(`Name: ${response.data.name}`);
    console.log(`Schema: ${JSON.stringify(response.data.jsonSchema, null, 2)}`);

    return response.data;
  } catch (error) {
    console.error(
      "❌ Error creating prompt:",
      error.response?.data || error.message
    );
    return null;
  }
}

// Example 2: Use prompt with different providers
async function usePromptWithProviders(promptId) {
  console.log("\n🔍 Example 2: Using Prompt with Different Providers\n");

  const providers = [
    { name: "OpenAI", type: "openai", model: "gpt-4" },
    { name: "Ollama", type: "custom", model: "llama3.1:8b" },
    { name: "DashScope", type: "dashscope", model: "qwen3-max" },
  ];

  for (const provider of providers) {
    console.log(`\n🚀 Testing with ${provider.name} (${provider.type})`);
    console.log("-".repeat(50));

    try {
      // Get available providers
      const providersResponse = await axios.get(`${BASE_URL}/api/ai-providers`);
      const aiProviders = providersResponse.data.data || providersResponse.data;

      const targetProvider = aiProviders.find(
        (p) => p.type === provider.type && p.available
      );

      if (!targetProvider) {
        console.log(`❌ Provider ${provider.type} not available`);
        continue;
      }

      // Use the prompt with structured output
      const requestPayload = {
        messages: [
          {
            role: "user",
            content: "Explain the binary search algorithm in Python",
          },
        ],
        model: provider.model,
        promptId: promptId,
        temperature: 0.7,
      };

      console.log(`📤 Sending request with prompt ID: ${promptId}`);
      const startTime = Date.now();

      const response = await axios.post(
        `${BASE_URL}/api/ai-providers/${targetProvider.id}/chat-completion-with-prompt`,
        requestPayload,
        {
          headers: { "Content-Type": "application/json" },
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

        // Try to parse as JSON
        try {
          const parsed = JSON.parse(content);
          console.log(`✅ Valid JSON structure received:`);
          console.log(JSON.stringify(parsed, null, 2));

          // Validate required fields
          const requiredFields = [
            "algorithm_name",
            "description",
            "time_complexity",
            "code_example",
          ];
          const missingFields = requiredFields.filter(
            (field) => !(field in parsed)
          );

          if (missingFields.length === 0) {
            console.log(`✅ All required fields present`);
          } else {
            console.log(
              `⚠️  Missing required fields: ${missingFields.join(", ")}`
            );
          }
        } catch (parseError) {
          console.log(`❌ Response is not valid JSON: ${parseError.message}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error with ${provider.name}:`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(
          `   Message: ${error.response.data?.message || error.response.statusText}`
        );
      } else {
        console.log(`   ${error.message}`);
      }
    }
  }
}

// Example 3: Different schema formats for different providers
async function demonstrateSchemaFormats() {
  console.log("\n📋 Example 3: Different Schema Formats\n");

  const schemas = {
    openai: {
      name: "weather_response",
      strict: true,
      schema: {
        type: "object",
        properties: {
          location: { type: "string", description: "City or location name" },
          temperature: {
            type: "number",
            description: "Temperature in Celsius",
          },
          conditions: {
            type: "string",
            description: "Weather conditions description",
          },
        },
        required: ["location", "temperature", "conditions"],
        additionalProperties: false,
      },
    },
    ollama: {
      type: "object",
      properties: {
        language: { type: "string" },
        algorithm: { type: "string" },
        code: { type: "string" },
        time_complexity: { type: "string" },
      },
      required: ["language", "algorithm", "code"],
    },
    custom: {
      type: "object",
      properties: {
        summary: { type: "string" },
        key_points: { type: "array", items: { type: "string" } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["summary", "key_points"],
    },
  };

  console.log("OpenAI Format (with response_format wrapper):");
  console.log(JSON.stringify(schemas.openai, null, 2));

  console.log("\nOllama Format (direct format field):");
  console.log(JSON.stringify(schemas.ollama, null, 2));

  console.log("\nCustom Format (for system message injection):");
  console.log(JSON.stringify(schemas.custom, null, 2));
}

// Example 4: Schema validation and compatibility
async function validateSchemaCompatibility() {
  console.log("\n🔍 Example 4: Schema Validation\n");

  const testSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      hobbies: { type: "array", items: { type: "string" } },
    },
    required: ["name", "age"],
    additionalProperties: false,
  };

  const providers = ["openai", "ollama", "dashscope", "perplexity"];

  for (const provider of providers) {
    console.log(`\nValidating schema for ${provider}:`);

    // Simulate validation logic
    const warnings = [];
    const suggestions = [];

    if (!testSchema.type || testSchema.type !== "object") {
      warnings.push("Schema should have type: 'object'");
    }

    if (
      !testSchema.properties ||
      Object.keys(testSchema.properties).length === 0
    ) {
      warnings.push("Schema should have properties defined");
    }

    if (provider === "openai" && testSchema.additionalProperties === true) {
      warnings.push("OpenAI works better with additionalProperties: false");
    }

    if (provider === "ollama" && testSchema.definitions) {
      warnings.push("Ollama may not support complex schema references");
    }

    if (warnings.length === 0) {
      console.log("✅ Schema is compatible");
    } else {
      console.log("⚠️  Warnings:");
      warnings.forEach((warning) => console.log(`   - ${warning}`));
    }
  }
}

// Main execution
async function runExamples() {
  console.log("🚀 Knowledge Hub - Prompt Structured Output Examples\n");
  console.log("=".repeat(60));

  try {
    // Create a prompt with structured output
    const prompt = await createPromptWithSchema();
    if (!prompt) {
      console.log("❌ Failed to create prompt, skipping other examples");
      return;
    }

    // Demonstrate different schema formats
    await demonstrateSchemaFormats();

    // Validate schema compatibility
    await validateSchemaCompatibility();

    // Use prompt with different providers
    await usePromptWithProviders(prompt.id);

    console.log("\n" + "=".repeat(60));
    console.log("✅ All examples completed successfully!");
  } catch (error) {
    console.error("\n❌ Example failed:", error.message);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  createPromptWithSchema,
  usePromptWithProviders,
  demonstrateSchemaFormats,
  validateSchemaCompatibility,
};
