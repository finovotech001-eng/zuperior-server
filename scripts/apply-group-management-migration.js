// Script to apply group_management migration directly
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('Applying group_management migration...');
    
    // Add new columns
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "group_management" 
      ADD COLUMN IF NOT EXISTS "account_type" VARCHAR(10),
      ADD COLUMN IF NOT EXISTS "leverage" INTEGER,
      ADD COLUMN IF NOT EXISTS "min_deposit" DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS "spread" DECIMAL(5, 2),
      ADD COLUMN IF NOT EXISTS "commission" DECIMAL(5, 2);
    `);
    
    console.log('✅ Columns added');
    
    // Create index
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "group_management_account_type_idx" ON "group_management"("account_type");
    `);
    
    console.log('✅ Index created');
    
    // Populate account_type from group column
    await prisma.$executeRawUnsafe(`
      UPDATE "group_management"
      SET "account_type" = CASE
        WHEN "group" ILIKE '%demo%' THEN 'Demo'
        WHEN "group" ILIKE '%real%' THEN 'Live'
        ELSE NULL
      END
      WHERE "account_type" IS NULL;
    `);
    
    console.log('✅ account_type populated');
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();

