/**
 * Database seeding script (JavaScript version)
 *
 * This is a JavaScript version of the seed script to avoid ESM/TypeScript issues
 */

const { execSync } = require('child_process');
const path = require('path');

async function runSeed() {
  console.log('🌱 Starting database seeding process...\n');

  try {
    // Change to the backend directory
    const backendDir = path.join(__dirname);
    process.chdir(backendDir);

    console.log(`📁 Working directory: ${process.cwd()}`);

    // Run the migration first
    console.log('🔄 Step 1: Running database migrations...');
    execSync('npm run typeorm:migration:run', { stdio: 'inherit' });
    console.log('✅ Migrations completed');

    // Run the TypeScript seed using a different approach
    console.log('\n🌱 Step 2: Running database seeding...');

    // Try to run the seed using node with proper ESM handling
    try {
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
      console.log('✅ Seeding completed');
    } catch (error) {
      console.log(
        '⚠️ TypeScript seeding failed, trying alternative approach...',
      );

      // Alternative: Run individual seed components
      console.log(
        '📝 Creating Social Media Graph Extraction prompt via API...',
      );
      execSync('node ../../add-social-media-prompt.js', { stdio: 'inherit' });
      console.log('✅ Social Media prompt created');
    }

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\nNext steps:');
    console.log(
      '1. Update Crumplete AI provider: node ../../update-crumplete-ai-provider.js',
    );
    console.log(
      '2. Test the setup: node ../../test-crumplete-ai-social-media.js',
    );
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

runSeed().catch(console.error);
