// Script to add mt5AccountId to Withdrawal table
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMt5AccountIdToWithdrawal() {
  try {
    console.log('🔄 Adding mt5AccountId column to Withdrawal table...');
    
    // Add column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Withdrawal" 
      ADD COLUMN IF NOT EXISTS "mt5AccountId" TEXT;
    `);
    console.log('✅ Column added');

    // Add foreign key constraint if it doesn't exist
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'Withdrawal_mt5AccountId_fkey'
          ) THEN
              ALTER TABLE "Withdrawal" 
              ADD CONSTRAINT "Withdrawal_mt5AccountId_fkey" 
              FOREIGN KEY ("mt5AccountId") 
              REFERENCES "MT5Account"("id") 
              ON DELETE NO ACTION 
              ON UPDATE NO ACTION;
          END IF;
      END $$;
    `);
    console.log('✅ Foreign key constraint added');

    // Add index if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Withdrawal_mt5AccountId_idx" 
      ON "Withdrawal"("mt5AccountId");
    `);
    console.log('✅ Index added');

    // Update existing internal transfer withdrawals
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "Withdrawal" w
      SET "mt5AccountId" = mt."mt5AccountId"
      FROM "MT5Transaction" mt
      WHERE w."externalTransactionId" = mt."id"
        AND w."paymentMethod" = 'internal_transfer'
        AND w."mt5AccountId" IS NULL;
    `);
    console.log(`✅ Updated ${result} existing internal transfer withdrawals`);

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addMt5AccountIdToWithdrawal();

