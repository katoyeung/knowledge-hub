// Jest e2e test setup
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Ensure upload directories exist
const uploadDirs = [
  'uploads',
  'uploads/documents',
  'uploads/temp',
  'uploads/vector-stores',
];

uploadDirs.forEach((dir) => {
  const fullPath = join(process.cwd(), dir);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${fullPath}`);
  }
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'root';
// Use existing database instead of test database
process.env.DB_DATABASE = process.env.DB_DATABASE || 'knowledge_hub';

// Increase timeout for e2e tests
jest.setTimeout(120000);

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting comprehensive e2e tests...');
  console.log(
    `Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  );
});

afterAll(async () => {
  console.log('✅ Comprehensive e2e tests completed');
});
