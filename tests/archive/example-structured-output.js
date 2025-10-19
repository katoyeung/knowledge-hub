/**
 * Example: Using Structured Output with Knowledge Hub LLM Providers
 *
 * This example demonstrates how to use structured output with different
 * LLM providers to get consistent JSON responses.
 */

const axios = require("axios");

const BASE_URL = "http://localhost:3001";

// Example 1: Algorithm explanation with structured output
async function explainAlgorithm() {
  console.log("🔍 Example 1: Algorithm Explanation\n");

  const schema = {
    type: "object",
    properties: {
      algorithm_name: { type: "string" },
      description: { type: "string" },
      time_complexity: { type: "string" },
      space_complexity: { type: "string" },
      code_example: { type: "string" },
      use_cases: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "algorithm_name",
      "description",
      "time_complexity",
      "code_example",
    ],
  };

  const message =
    "Explain the binary search algorithm with a code example in Python";

  try {
    const response = await makeStructuredRequest(message, schema, "gpt-4");
    console.log("✅ Structured Response:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Example 2: Data analysis with structured output
async function analyzeData() {
  console.log("\n📊 Example 2: Data Analysis\n");

  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      key_insights: {
        type: "array",
        items: { type: "string" },
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
      },
      confidence_score: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["summary", "key_insights", "confidence_score"],
  };

  const message =
    "Analyze this sales data: Q1: $100k, Q2: $120k, Q3: $95k, Q4: $140k. Provide insights and recommendations.";

  try {
    const response = await makeStructuredRequest(message, schema, "gpt-4");
    console.log("✅ Analysis Result:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Example 3: Code review with structured output
async function reviewCode() {
  console.log("\n🔍 Example 3: Code Review\n");

  const schema = {
    type: "object",
    properties: {
      overall_rating: { type: "number", minimum: 1, maximum: 10 },
      issues_found: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            description: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["severity", "description"],
        },
      },
      strengths: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
    },
    required: ["overall_rating", "issues_found", "strengths"],
  };

  const message = `Review this Python function:
  def fibonacci(n):
      if n <= 1:
          return n
      return fibonacci(n-1) + fibonacci(n-2)
  
  What are the issues and how can it be improved?`;

  try {
    const response = await makeStructuredRequest(message, schema, "gpt-4");
    console.log("✅ Code Review:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Helper function to make structured requests
async function makeStructuredRequest(message, schema, model = "gpt-4") {
  // First, get available providers
  const providersResponse = await axios.get(`${BASE_URL}/api/ai-providers`);
  const providers = providersResponse.data.data || providersResponse.data;

  // Find OpenAI provider (or first available provider)
  const provider =
    providers.find((p) => p.type === "openai" && p.available) ||
    providers.find((p) => p.available);

  if (!provider) {
    throw new Error("No available providers found");
  }

  console.log(`Using provider: ${provider.name} (${provider.type})`);

  const payload = {
    messages: [{ role: "user", content: message }],
    model: model,
    jsonSchema: schema,
    temperature: 0.7,
  };

  const response = await axios.post(
    `${BASE_URL}/api/ai-providers/${provider.id}/chat-completion`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    }
  );

  const content = response.data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in response");
  }

  // Parse JSON response
  try {
    return JSON.parse(content);
  } catch (parseError) {
    throw new Error(`Invalid JSON response: ${parseError.message}`);
  }
}

// Run examples
async function runExamples() {
  console.log("🚀 Knowledge Hub - Structured Output Examples\n");
  console.log("=".repeat(60));

  try {
    await explainAlgorithm();
    await analyzeData();
    await reviewCode();

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
  explainAlgorithm,
  analyzeData,
  reviewCode,
  makeStructuredRequest,
};
