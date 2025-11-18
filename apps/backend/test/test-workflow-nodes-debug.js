/**
 * Test workflow nodes with debugging - check what data is actually being passed
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
    console.log(`\nPrevious Output Structure:`);
    console.log(
      `  Type: ${Array.isArray(previousOutput) ? 'array' : typeof previousOutput}`,
    );
    if (typeof previousOutput === 'object' && previousOutput !== null) {
      console.log(`  Keys: ${Object.keys(previousOutput).join(', ')}`);
      if (Array.isArray(previousOutput.items)) {
        console.log(`  items.length: ${previousOutput.items.length}`);
        if (previousOutput.items.length > 0) {
          const firstItem = previousOutput.items[0];
          console.log(
            `  First item keys: ${Object.keys(firstItem).join(', ')}`,
          );
          if (firstItem.meta) {
            console.log(
              `  First item.meta keys: ${Object.keys(firstItem.meta).join(', ')}`,
            );
            if (firstItem.meta.post_message) {
              console.log(
                `  First item.meta.post_message length: ${firstItem.meta.post_message?.length || 0}`,
              );
            }
          }
        }
      }
      if (Array.isArray(previousOutput.duplicates)) {
        console.log(`  duplicates.length: ${previousOutput.duplicates.length}`);
        if (previousOutput.duplicates.length > 0) {
          console.log(
            `  First duplicate keys: ${Object.keys(previousOutput.duplicates[0]).join(', ')}`,
          );
        }
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
    console.log(`\nOutput Structure:`);
    console.log(`  Type: ${Array.isArray(output) ? 'array' : typeof output}`);

    if (typeof output === 'object' && output !== null) {
      console.log(`  Keys: ${Object.keys(output).join(', ')}`);

      if (Array.isArray(output.items)) {
        console.log(`  items.length: ${output.items.length}`);
      }

      if (Array.isArray(output.duplicates)) {
        console.log(`  duplicates.length: ${output.duplicates.length}`);
        if (output.duplicates.length > 0) {
          console.log(
            `  First duplicate:`,
            JSON.stringify(output.duplicates[0], null, 2).substring(0, 500),
          );
        }
      }

      if (output.total !== undefined) {
        console.log(`  total: ${output.total}`);
      }

      if (output.duplicate_count !== undefined) {
        console.log(`  duplicate_count: ${output.duplicate_count}`);
      }

      if (output.warning) {
        console.log(`  ⚠️  WARNING: ${output.warning}`);
      }
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
  console.log('Starting workflow node-by-node test with debugging...\n');

  // Step 1: Test Post Data Source with more items
  const datasourceConfig = {
    limit: 50, // Get more items to increase chance of duplicates
  };

  const datasourceOutput = await testNode('post_datasource', datasourceConfig);

  // Step 2: Test Duplicate Segment Detection
  // Try different contentField paths to see which works
  console.log('\n🔍 Testing with contentField: "meta.post_message"');
  const duplicateConfig1 = {
    method: 'similarity',
    contentField: 'meta.post_message', // Simplified path
    caseSensitive: false,
    normalizeText: true,
    ignoreWhitespace: true,
    similarityThreshold: 0.9,
  };

  const duplicateOutput1 = await testNode(
    'duplicate_segment',
    duplicateConfig1,
    datasourceOutput,
  );

  // If we got duplicates, test Post Deleter
  if (duplicateOutput1.duplicates && duplicateOutput1.duplicates.length > 0) {
    console.log('\n✅ Found duplicates! Testing Post Deleter...');
    const deleterConfig = {
      fieldMappings: {
        id: 'duplicates.id',
      },
      useDuplicates: false,
    };

    await testNode('post_deleter', deleterConfig, duplicateOutput1);
  } else {
    console.log(
      '\n⚠️  No duplicates found. Testing Post Deleter anyway to see the error...',
    );
    const deleterConfig = {
      fieldMappings: {
        id: 'duplicates.id',
      },
      useDuplicates: false,
    };

    await testNode('post_deleter', deleterConfig, duplicateOutput1);
  }
}

main().catch(console.error);
