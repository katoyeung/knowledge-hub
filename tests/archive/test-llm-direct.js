const axios = require("axios");

async function testLLMDirect() {
  try {
    console.log("🧪 Testing LLM API directly...");

    const response = await axios.post(
      "https://llmendpoint.crumplete.dev/api/chat/completions",
      {
        model: "llama4:scout",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that extracts entities and relationships from text.",
          },
          {
            role: "user",
            content:
              'Extract entities and relationships from this text: "John loves Apple products and tweets about #iPhone regularly."',
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: "Bearer sk-8bd74f9c88964bf3accd078fc7c996cc",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log("✅ LLM API Response:", response.data);
  } catch (error) {
    console.error("❌ LLM API Error:", error.response?.data || error.message);
  }
}

testLLMDirect();
