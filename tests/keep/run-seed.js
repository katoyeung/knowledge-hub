/**
 * Run database seeding
 *
 * This script runs the database seeding process including the new Social Media Graph Extraction prompt
 */

const { execSync } = require("child_process");
const path = require("path");

console.log("🌱 Starting database seeding process...\n");

try {
  // Change to the backend directory
  const backendDir = path.join(__dirname, "apps", "backend");
  process.chdir(backendDir);

  console.log(`📁 Working directory: ${process.cwd()}`);

  // Run the migration first
  console.log("\n🔄 Step 1: Running database migrations...");
  execSync("npm run typeorm:migration:run", { stdio: "inherit" });
  console.log("✅ Migrations completed");

  // Run the seed
  console.log("\n🌱 Step 2: Running database seeding...");
  execSync("npm run seed", { stdio: "inherit" });
  console.log("✅ Seeding completed");

  console.log("\n🎉 Database setup completed successfully!");
  console.log("\nNext steps:");
  console.log(
    "1. Update Crumplete AI provider: node update-crumplete-ai-provider.js"
  );
  console.log("2. Test the setup: node test-crumplete-ai-social-media.js");
} catch (error) {
  console.error("\n❌ Seeding failed:", error.message);
  process.exit(1);
}
