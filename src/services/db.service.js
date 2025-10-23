// zuperior-back/src/services/db.service.js
import { PrismaClient } from '@prisma/client';

// Singleton Prisma Client with proper configuration
class DatabaseService {
  constructor() {
    if (!DatabaseService.instance) {
      try {
        this._prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
          errorFormat: 'pretty',
          // Do not pass datasources here to avoid early env resolution during ESM module linking.
        });

        // Handle graceful shutdown
        this.setupShutdownHooks();

        DatabaseService.instance = this;
      } catch (error) {
        console.error('Failed to initialize PrismaClient:', error);
        this._prisma = null;
        DatabaseService.instance = this;
      }
    }

    return DatabaseService.instance;
  }

  get prisma() {
    if (!this._prisma) {
      throw new Error('PrismaClient not initialized. Check database connection.');
    }
    return this._prisma;
  }

  setupShutdownHooks() {
    if (!this._prisma) {
      return;
    }

    // Handle different termination signals
    const shutdown = async (signal) => {
      console.log(`Received ${signal}. Closing Prisma client...`);
      await this._prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('beforeExit', () => shutdown('beforeExit'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      await this._prisma.$disconnect();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await this._prisma.$disconnect();
      process.exit(1);
    });
  }

  // Health check method
  async healthCheck() {
    if (!this._prisma) {
      return { status: 'unhealthy', error: 'PrismaClient not initialized', timestamp: new Date().toISOString() };
    }
    try {
      await this._prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('Database health check failed:', error);
      return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // Transaction helper with proper error handling
  async executeTransaction(operations) {
    if (!this._prisma) {
      throw new Error('PrismaClient not initialized. Check database connection.');
    }
    try {
      return await this._prisma.$transaction(async (tx) => {
        const results = [];
        for (const operation of operations) {
          const result = await operation(tx);
          results.push(result);
        }
        return results;
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  // Connection management
  async connect() {
    if (!this._prisma) {
      throw new Error('PrismaClient not initialized. Check database connection.');
    }
    try {
      await this._prisma.$connect();
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (!this._prisma) {
      console.log('✅ Database already disconnected or not initialized');
      return;
    }
    try {
      await this._prisma.$disconnect();
      console.log('✅ Database disconnected successfully');
    } catch (error) {
      console.error('❌ Database disconnection failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const dbService = new DatabaseService();
export default dbService;
export { DatabaseService };

// Named helper: fetch a user with common relations
export const getUserByEmail = async (email) => {
  try {
    return await dbService.prisma.user.findUnique({
      where: { email },
      include: {
        accounts: true,
        kyc: true,
        deposits: true,
        withdrawals: true,
      },
    });
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
};
