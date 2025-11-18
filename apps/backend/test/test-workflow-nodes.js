/**
 * Test workflow nodes step by step
 * This script tests each node in the workflow to debug data flow issues
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYyNjUyNTkzLCJleHAiOjE3NjUyNDQ1OTN9.zNnF_h9alEjUODGtoVpF7HpkQev84LX8DqsImG_oFPs';

async function testNode(stepType, config, previousOutput) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${stepType}`);
  console.log(`Config:`, JSON.stringify(config, null, 2));

  if (previousOutput) {
    console.log(
      `Previous Output Type: ${Array.isArray(previousOutput) ? 'array' : typeof previousOutput}`,
    );
    if (typeof previousOutput === 'object' && previousOutput !== null) {
      console.log(
        `Previous Output Keys: ${Object.keys(previousOutput).join(', ')}`,
      );
      if (Array.isArray(previousOutput.items)) {
        console.log(
          `Previous Output items.length: ${previousOutput.items.length}`,
        );
      }
      if (Array.isArray(previousOutput.duplicates)) {
        console.log(
          `Previous Output duplicates.length: ${previousOutput.duplicates.length}`,
        );
      }
    }
  }
  console.log(`${'='.repeat(80)}\n`);

  try {
    const response = await axios.post(
      `${API_BASE}/workflow/steps/test`,
      {
        stepType,
        config,
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
    console.log(`✅ Success!`);
    console.log(
      `Output Type: ${Array.isArray(output) ? 'array' : typeof output}`,
    );

    if (typeof output === 'object' && output !== null) {
      console.log(`Output Keys: ${Object.keys(output).join(', ')}`);

      if (Array.isArray(output.items)) {
        console.log(`Output items.length: ${output.items.length}`);
        if (output.items.length > 0) {
          console.log(
            `First item keys: ${Object.keys(output.items[0]).join(', ')}`,
          );
        }
      }

      if (Array.isArray(output.duplicates)) {
        console.log(`Output duplicates.length: ${output.duplicates.length}`);
        if (output.duplicates.length > 0) {
          console.log(
            `First duplicate keys: ${Object.keys(output.duplicates[0]).join(', ')}`,
          );
        }
      }

      if (output.total !== undefined) {
        console.log(`Output total: ${output.total}`);
      }

      if (output.duplicate_count !== undefined) {
        console.log(`Output duplicate_count: ${output.duplicate_count}`);
      }
    }

    // Show sample output (first 1000 chars)
    const outputStr = JSON.stringify(output, null, 2);
    console.log(
      `\nOutput Sample:\n${outputStr.substring(0, 1000)}${outputStr.length > 1000 ? '...' : ''}\n`,
    );

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
  console.log('Starting workflow node-by-node test...\n');

  // Step 1: Test Post Data Source
  const datasourceConfig = {
    limit: 10,
  };

  const datasourceOutput = await testNode('post_datasource', datasourceConfig);

  // Step 2: Test Duplicate Segment Detection with datasource output
  const duplicateConfig = {
    method: 'similarity',
    contentField: 'items.meta.post_message',
    caseSensitive: false,
    normalizeText: true,
    ignoreWhitespace: true,
    similarityThreshold: 0.9,
  };

  const duplicateOutput = await testNode(
    'duplicate_segment',
    duplicateConfig,
    datasourceOutput,
  );

  // Step 3: Test Post Deleter with duplicate output
  const deleterConfig = {
    fieldMappings: {
      id: 'duplicates.id',
    },
    useDuplicates: false,
  };

  await testNode('post_deleter', deleterConfig, duplicateOutput);

  console.log('\n✅ All nodes tested successfully!');
}

main().catch(console.error);
