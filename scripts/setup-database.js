#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up database for Super Agent...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('Please create a .env file with the following variables:');
  console.log('DATABASE_URL="postgresql://username:password@localhost:5432/super_agent_db"');
  console.log('REDIS_HOST=localhost');
  console.log('REDIS_PORT=6379');
  console.log('CACHE_TTL=300');
  process.exit(1);
}

try {
  // Generate Prisma client
  console.log('📦 Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated successfully\n');

  // Run database migrations
  console.log('🔄 Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Database migrations completed successfully\n');

  // Optional: Seed database with initial data
  console.log('🌱 Database setup completed!');
  console.log('\nNext steps:');
  console.log('1. Start your application: npm run start:dev');
  console.log('2. Test the database integration by making a chat request');
  console.log('3. Check the database to see stored conversations and sessions');

} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  console.log('\nTroubleshooting:');
  console.log('1. Make sure PostgreSQL is running');
  console.log('2. Check your DATABASE_URL in .env file');
  console.log('3. Ensure you have the correct database permissions');
  process.exit(1);
} 