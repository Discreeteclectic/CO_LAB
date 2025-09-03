const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

// Test database setup
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-key';
process.env.PORT = '5002';

let prisma;

beforeAll(async () => {
  // Initialize test database
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  // Clean up any existing test database
  const testDbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Apply migrations
  const { execSync } = require('child_process');
  try {
    execSync('npx prisma db push', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    console.warn('Database migration failed:', error.message);
  }
});

beforeEach(async () => {
  // Clean up database before each test
  if (prisma) {
    const tablenames = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table';`;
    
    const tables = tablenames
      .map((table) => table.name)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"${name}"`)
      .join(', ');

    try {
      if (tables.length > 0) {
        await prisma.$executeRawUnsafe(`DELETE FROM ${tables}`);
      }
    } catch (error) {
      console.log('Error cleaning database:', error.message);
    }
  }
});

afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }

  // Clean up test database
  const testDbPath = path.join(__dirname, '..', 'prisma', 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Global test utilities
global.testPrisma = prisma;

// Mock external services for tests
jest.mock('../src/services/openaiService', () => ({
  generateProposal: jest.fn().mockResolvedValue({
    content: 'Mock AI generated proposal',
    success: true
  }),
  isConfigured: jest.fn().mockReturnValue(false)
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
}));

// Increase timeout for database operations
jest.setTimeout(30000);