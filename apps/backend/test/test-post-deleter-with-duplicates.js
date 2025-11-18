/**
 * Test Post Deleter with simulated Duplicate Segment Detection output
 * This simulates what happens when duplicates ARE found
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYyNjUyNTkzLCJleHAiOjE3NjUyNDQ1OTN9.zNnF_h9alEjUODGtoVpF7HpkQev84LX8DqsImG_oFPs';

// Simulate the output structure from Duplicate Segment Detection
const mockDuplicateOutput = {
  items: [
    { id: 'item-1', title: 'Unique Item 1' },
    { id: 'item-2', title: 'Unique Item 2' },
  ],
  total: 2,
  duplicates: [
    {
      id: 'dup-1',
      title: 'Duplicate 1',
      meta: { post_message: 'Test message' },
    },
    {
      id: 'dup-2',
      title: 'Duplicate 2',
      meta: { post_message: 'Test message' },
    },
    {
      id: 'dup-3',
      title: 'Duplicate 3',
      meta: { post_message: 'Test message' },
    },
  ],
  duplicate_count: 3,
};

async function testPostDeleter(previousOutput, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing Post Deleter: ${description}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Input Structure:`);
  console.log(
    `  Type: ${Array.isArray(previousOutput) ? 'array' : typeof previousOutput}`,
  );
  if (typeof previousOutput === 'object' && previousOutput !== null) {
    console.log(`  Keys: ${Object.keys(previousOutput).join(', ')}`);
    if (Array.isArray(previousOutput.items)) {
      console.log(`  items.length: ${previousOutput.items.length}`);
    }
    if (Array.isArray(previousOutput.duplicates)) {
      console.log(`  duplicates.length: ${previousOutput.duplicates.length}`);
      if (previousOutput.duplicates.length > 0) {
        console.log(
          `  First duplicate:`,
          JSON.stringify(previousOutput.duplicates[0], null, 2),
        );
      }
    }
  }
  console.log(
    `\nFull Input:`,
    JSON.stringify(previousOutput, null, 2).substring(0, 1000),
  );
  console.log(`\n`);

  const deleterConfig = {
    fieldMappings: {
      id: 'duplicates.id',
    },
    useDuplicates: false,
  };

  try {
    const response = await axios.post(
      `${API_BASE}/workflow/steps/test`,
      {
        stepType: 'post_deleter',
        config: deleterConfig,
        userId: '72287e07-967e-4de6-88b0-ff8c16f43991',
        previousOutput,
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const output = response.data;
    console.log(`✅ Result:`);
    console.log(JSON.stringify(output, null, 2));

    if (output.warning) {
      console.log(`\n⚠️  WARNING: ${output.warning}`);
    }

    return output;
  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
    if (error.response?.data) {
      console.error(
        `Error details:`,
        JSON.stringify(error.response.data, null, 2),
      );
    }
    throw error;
  }
}

async function main() {
  console.log('Testing Post Deleter with different input formats...\n');

  // Test 1: Direct object (as it would come from Duplicate Segment Detection)
  await testPostDeleter(mockDuplicateOutput, 'Direct object format');

  // Test 2: Wrapped in array (as it might be passed)
  await testPostDeleter([mockDuplicateOutput], 'Wrapped in array format');

  // Test 3: As DocumentSegment-like structure
  const segmentFormat = {
    content: JSON.stringify(mockDuplicateOutput),
  };
  await testPostDeleter(
    [segmentFormat],
    'DocumentSegment format with JSON content',
  );
}

main().catch(console.error);
