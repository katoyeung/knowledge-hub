const axios = require("axios");

const AUTH_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYwNTk0OTY5LCJleHAiOjE3NjMxODY5Njl9.S8K2K19GGW-d6la4JmZ-t7FxDpfuouxiW4KCL_3FmDk";

async function checkPrompts() {
  try {
    const response = await axios.get("http://localhost:3001/prompts", {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    const prompts = response.data.data || response.data;
    console.log("Available prompts:");
    prompts.forEach((p) => {
      console.log(`- ${p.name} (ID: ${p.id}, Active: ${p.isActive})`);
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

checkPrompts();
