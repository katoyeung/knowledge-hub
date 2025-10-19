const axios = require("axios");

async function testLLMWithPrompt() {
  try {
    console.log("🧪 Testing LLM with graph extraction prompt...");

    const response = await axios.post(
      "https://llmendpoint.crumplete.dev/api/chat/completions",
      {
        model: "llama4:scout",
        messages: [
          {
            role: "system",
            content:
              'You are an expert in social media analysis and graph database modeling. Your task is to extract entities (nodes) and their relationships (edges) from the provided social media text. Focus on identifying authors, brands, topics, hashtags, and their interactions. Output the extracted information as a JSON object with two main arrays: "nodes" and "edges".',
          },
          {
            role: "user",
            content: `Social Media Text:
"""
John loves Apple products and tweets about #iPhone regularly. He also follows @Apple and @TimCook on Twitter.
"""

Extract entities and relationships from the above text and return a JSON object with "nodes" and "edges" arrays.`,
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

    console.log("✅ LLM Response:", JSON.stringify(response.data, null, 2));

    // Try to parse the response
    const content = response.data.choices[0].message.content;
    console.log("Content:", content);

    // Try to extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("✅ Parsed JSON:", JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log("❌ Failed to parse JSON:", e.message);
      }
    } else {
      console.log("❌ No JSON found in response");
    }
  } catch (error) {
    console.error("❌ LLM API Error:", error.response?.data || error.message);
  }
}

testLLMWithPrompt();
