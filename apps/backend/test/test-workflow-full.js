/**
 * Full workflow test - shows complete output for each node
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwic3ViIjoiNzIyODdlMDctOTY3ZS00ZGU2LTg4YjAtZmY4YzE2ZjQzOTkxIiwiaWF0IjoxNzYyNjUyNTkzLCJleHAiOjE3NjUyNDQ1OTN9.zNnF_h9alEjUODGtoVpF7HpkQev84LX8DqsImG_oFPs';

async function testNode(stepType, config, previousOutput) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${stepType}`);
  console.log(`Config:`, JSON.stringify(config, null, 2));

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
    console.log(`\n✅ Success!`);
    console.log(`Output:`, JSON.stringify(output, null, 2));
    return output;
  } catch (error) {
    console.error(`❌ Error:`, error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('Testing full workflow...\n');

  // Step 1: Post Data Source
  const datasourceOutput = await testNode('post_datasource', { limit: 50 });

  // Step 2: Duplicate Segment Detection
  const duplicateOutput = await testNode(
    'duplicate_segment',
    {
      method: 'similarity',
      contentField: 'meta.post_message',
      caseSensitive: false,
      normalizeText: true,
      ignoreWhitespace: true,
      similarityThreshold: 0.9,
    },
    datasourceOutput,
  );

  // Step 3: Post Deleter
  const deleterOutput = await testNode(
    'post_deleter',
    {
      fieldMappings: {
        id: 'duplicates.id',
      },
      useDuplicates: false,
    },
    duplicateOutput,
  );

  console.log('\n' + '='.repeat(80));
  console.log('WORKFLOW TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Post Data Source: ${datasourceOutput.items?.length || 0} items`);
  console.log(
    `Duplicate Detection: ${duplicateOutput.duplicate_count || 0} duplicates found`,
  );
  console.log(
    `Post Deleter: ${deleterOutput.deleted || 0} deleted, ${deleterOutput.requested || 0} requested`,
  );
  if (deleterOutput.warning) {
    console.log(`⚠️  Warning: ${deleterOutput.warning}`);
  }
  console.log('='.repeat(80));
}

main().catch(console.error);
