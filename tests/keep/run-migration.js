/**
 * Run database migration
 *
 * This script runs the database migration to add the ollama type
 */

const { execSync } = require("child_process");
const path = require("path");

console.log("🔄 Running database migration...\n");

try {
  // Change to the backend directory
  const backendDir = path.join(__dirname, "apps", "backend");
  process.chdir(backendDir);

  console.log(`📁 Working directory: ${process.cwd()}`);

  // Run the migration
  console.log("🔄 Running migration to add ollama type...");
  execSync("npm run typeorm:migration:run", { stdio: "inherit" });
  console.log("✅ Migration completed successfully");
} catch (error) {
  console.error("\n❌ Migration failed:", error.message);
  process.exit(1);
}
