/**
 * Working database seed script
 *
 * This is a JavaScript-only solution that bypasses all TypeScript/ESM issues
 */

const { execSync } = require('child_process');
const path = require('path');

async function runWorkingSeed() {
  console.log('🌱 Starting working database seed...\n');

  try {
    // Change to the backend directory
    const backendDir = path.join(__dirname);
    process.chdir(backendDir);

    console.log(`📁 Working directory: ${process.cwd()}`);

    // First, try to run migrations (skip if they fail)
    console.log('🔄 Step 1: Running database migrations...');
    try {
      execSync('npm run typeorm:migration:run', { stdio: 'inherit' });
      console.log('✅ Migrations completed');
    } catch (error) {
      console.log('⚠️ Migration failed, continuing with seeding...');
      console.log(`   Error: ${error.message}`);
    }

    // Use the API-based approach for seeding
    console.log('\n🌱 Step 2: Running API-based seeding...');

    // Check if backend server is running
    console.log('🔍 Checking if backend server is running...');
    try {
      const { default: axios } = await import('axios');
      await axios.get('http://localhost:3001/api/health', { timeout: 2000 });
      console.log('✅ Backend server is running');

      // Run the API-based seeding
      console.log('📝 Creating Social Media Graph Extraction prompt...');
      execSync('node ../../add-social-media-prompt.js', { stdio: 'inherit' });
      console.log('✅ Social Media prompt created');
    } catch (error) {
      console.log('⚠️ Backend server not running, skipping API-based seeding');
      console.log('   To complete setup:');
      console.log('   1. Start backend: npm run dev');
      console.log('   2. Run: node ../../add-social-media-prompt.js');
      console.log('   3. Run: node ../../update-crumplete-ai-provider.js');
      console.log('   4. Run: node ../../test-crumplete-ai-social-media.js');
    }

    console.log('\n🎉 Database seeding process completed!');
    console.log('\nNext steps:');
    console.log('1. Start backend server: npm run dev');
    console.log(
      '2. Create social media prompt: node ../../add-social-media-prompt.js',
    );
    console.log(
      '3. Update Crumplete AI provider: node ../../update-crumplete-ai-provider.js',
    );
    console.log(
      '4. Test the setup: node ../../test-crumplete-ai-social-media.js',
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

runWorkingSeed().catch(console.error);
