const axios = require("axios");

async function testPrompt() {
  try {
    console.log("🔍 Testing prompt retrieval...");

    const response = await axios.get("http://localhost:3001/prompts", {
      headers: {
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwNTk0OTY5LCJleHAiOjE3NjMxODY5Njl9.S8K2K19GGW-d6la4JmZ-t7FxDpfuouxiW4KCL_3FmDk",
      },
    });

    const graphPrompt = response.data.find(
      (p) => p.name === "Graph Extraction - Social Media Analysis"
    );
    if (graphPrompt) {
      console.log("✅ Graph extraction prompt found");
      console.log("Prompt ID:", graphPrompt.id);
      console.log("Prompt type:", graphPrompt.type);
      console.log(
        "System prompt length:",
        graphPrompt.systemPrompt?.length || 0
      );
      console.log(
        "User prompt template length:",
        graphPrompt.userPromptTemplate?.length || 0
      );
      console.log(
        "JSON schema:",
        graphPrompt.jsonSchema ? "Present" : "Missing"
      );
    } else {
      console.log("❌ Graph extraction prompt not found");
      console.log(
        "Available prompts:",
        response.data.map((p) => p.name)
      );
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testPrompt();
