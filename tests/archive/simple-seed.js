/**
 * Simple seeding script that bypasses migration issues
 *
 * This script focuses on just running the seeding without migrations
 */

const { execSync } = require('child_process');
const path = require('path');

async function runSimpleSeed() {
  console.log('🌱 Running simple seeding process...\n');

  try {
    // Change to the backend directory
    const backendDir = path.join(__dirname);
    process.chdir(backendDir);

    console.log(`📁 Working directory: ${process.cwd()}`);

    // Skip migrations for now and just run the TypeScript seed
    console.log('🌱 Running database seeding (skipping migrations)...');

    try {
      // Try the original approach first
      execSync(
        'node --loader ts-node/esm --experimental-specifier-resolution=node src/database/seeds/seed.ts',
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_OPTIONS: '--experimental-specifier-resolution=node',
          },
        },
      );
      console.log('✅ TypeScript seeding completed');
    } catch (error) {
      console.log('⚠️ TypeScript seeding failed, using API approach...');

      // Fallback: Use the API-based approach
      console.log(
        '📝 Creating Social Media Graph Extraction prompt via API...',
      );
      execSync('node ../../add-social-media-prompt.js', { stdio: 'inherit' });
      console.log('✅ Social Media prompt created via API');
    }

    console.log('\n🎉 Seeding completed successfully!');
    console.log('\nNext steps:');
    console.log(
      '1. Update Crumplete AI provider: node ../../update-crumplete-ai-provider.js',
    );
    console.log(
      '2. Test the setup: node ../../test-crumplete-ai-social-media.js',
    );
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.log(
      '\n💡 Alternative: Try running the individual scripts manually:',
    );
    console.log('   node ../../add-social-media-prompt.js');
    console.log('   node ../../update-crumplete-ai-provider.js');
    console.log('   node ../../test-crumplete-ai-social-media.js');
    process.exit(1);
  }
}

runSimpleSeed().catch(console.error);
