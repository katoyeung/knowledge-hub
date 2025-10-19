/**
 * Run database seeding
 *
 * This script compiles and runs the TypeScript seed file
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runSeed() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Change to the backend directory
    const backendDir = path.join(__dirname);
    process.chdir(backendDir);

    console.log(`📁 Working directory: ${process.cwd()}`);

    // First, try to run migrations
    console.log('🔄 Step 1: Running database migrations...');
    try {
      execSync('npm run typeorm:migration:run', { stdio: 'inherit' });
      console.log('✅ Migrations completed');
    } catch (error) {
      console.log('⚠️ Migration failed, continuing with seeding...');
      console.log(`   Error: ${error.message}`);
    }

    // Compile the TypeScript seed file to JavaScript
    console.log('\n🔨 Step 2: Compiling TypeScript seed file...');
    const seedTsPath = path.join(
      __dirname,
      'src',
      'database',
      'seeds',
      'seed.ts',
    );
    const seedJsPath = path.join(
      __dirname,
      'dist',
      'database',
      'seeds',
      'seed.js',
    );

    // Ensure dist directory exists
    const distDir = path.dirname(seedJsPath);
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Compile the TypeScript file
    try {
      execSync(
        `npx tsc ${seedTsPath} --outDir ${path.dirname(seedJsPath)} --target ES2021 --module CommonJS --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --experimentalDecorators --emitDecoratorMetadata --skipLibCheck`,
        {
          stdio: 'inherit',
        },
      );
      console.log('✅ TypeScript compiled successfully');
    } catch (error) {
      console.log(
        '⚠️ TypeScript compilation failed, trying alternative approach...',
      );

      // Alternative: Use the API-based seeding
      console.log('📝 Using API-based seeding...');
      execSync('node ../../add-social-media-prompt.js', { stdio: 'inherit' });
      console.log('✅ API-based seeding completed');
      return;
    }

    // Run the compiled JavaScript file
    console.log('\n🌱 Step 3: Running compiled seed file...');
    try {
      execSync(`node ${seedJsPath}`, { stdio: 'inherit' });
      console.log('✅ Seeding completed successfully');
    } catch (error) {
      console.log('⚠️ Compiled seed failed, trying API approach...');
      execSync('node ../../add-social-media-prompt.js', { stdio: 'inherit' });
      console.log('✅ API-based seeding completed');
    }

    console.log('\n🎉 Database seeding completed successfully!');
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

runSeed().catch(console.error);
