const axios = require("axios");

const API_BASE = "http://localhost:3001";
const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwNTk0OTY5LCJleHAiOjE3NjMxODY5Njl9.S8K2K19GGW-d6la4JmZ-t7FxDpfuouxiW4KCL_3FmDk";

async function testLLMResponse() {
  try {
    console.log("🔍 Testing LLM response directly...");

    const headers = {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
    };

    // Get a sample document segment
    const segmentsResponse = await axios.get(
      `${API_BASE}/document-segments/dataset/f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b`,
      { headers }
    );

    if (segmentsResponse.data && segmentsResponse.data.length > 0) {
      const sampleSegment = segmentsResponse.data[0];
      console.log(
        "Sample segment content:",
        sampleSegment.content.substring(0, 200) + "..."
      );

      // Test the LLM directly with a simple prompt
      const testPrompt = `Extract entities and relationships from this text. Return JSON with 'nodes' and 'edges' arrays.

Text: "${sampleSegment.content}"

Example format:
{
  "nodes": [
    {"type": "organization", "label": "Example Org", "properties": {}}
  ],
  "edges": [
    {"sourceNodeLabel": "Example Org", "targetNodeLabel": "Another Org", "edgeType": "related_to", "properties": {}}
  ]
}`;

      // Call the LLM directly
      const llmResponse = await axios.post(
        `${API_BASE}/api/ai-provider/29779ca1-cd3a-4ab5-9959-09f59cf918d5/chat-completion`,
        {
          messages: [{ role: "user", content: testPrompt }],
          model: "llama4:scout",
          temperature: 0.7,
        },
        { headers }
      );

      console.log("LLM Response:", JSON.stringify(llmResponse.data, null, 2));
    } else {
      console.log("No segments found");
    }
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

testLLMResponse();
