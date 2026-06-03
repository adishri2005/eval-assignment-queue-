// File: src/server.js
// Purpose: Entry point — starts the Express server, connects Prisma, and logs the port.

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const app = require('./app');

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

async function main() {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('[DB] Connected to MySQL via Prisma');

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`[SERVER] EAQ Backend running on http://localhost:${PORT}`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[SERVER] SIGTERM received. Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

main();
