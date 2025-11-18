// Script to remove columns not in Prisma model and set default values
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupTable() {
  try {
    console.log('Cleaning up group_management table...');
    
    // Columns to keep (from Prisma schema)
    const columnsToKeep = [
      'id',
      'group',
      'dedicated_name',
      'account_type',
      'server',
      'auth_mode',
      'auth_password_min',
      'currency',
      'leverage',
      'min_deposit',
      'spread',
      'commission',
      'is_active',
      'synced_at',
      'created_at',
      'updated_at'
    ];
    
    // Get all columns in the table
    const allColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'group_management' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    const columnsToDrop = allColumns
      .map((col) => col.column_name)
      .filter((col) => !columnsToKeep.includes(col));
    
    console.log(`Found ${columnsToDrop.length} columns to remove:`, columnsToDrop);
    
    // Drop columns that are not in the schema
    for (const column of columnsToDrop) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "group_management" DROP COLUMN IF EXISTS "${column}";
        `);
        console.log(`✅ Dropped column: ${column}`);
      } catch (error) {
        console.error(`❌ Failed to drop column ${column}:`, error.message);
      }
    }
    
    // Set default values based on image (same for all groups initially)
    // Image shows: $10 min deposit, 0.3 pips spread, 1:Unlimited leverage, 15% commission
    // For "1:Unlimited", we'll set leverage to NULL (which we'll handle as "Unlimited" in the UI)
    console.log('Setting default values for new columns...');
    
    await prisma.$executeRawUnsafe(`
      UPDATE "group_management"
      SET 
        "leverage" = COALESCE("leverage", NULL), -- NULL means "Unlimited"
        "min_deposit" = COALESCE("min_deposit", 10.00),
        "spread" = COALESCE("spread", 0.30),
        "commission" = COALESCE("commission", 15.00)
      WHERE "leverage" IS NULL 
         OR "min_deposit" IS NULL 
         OR "spread" IS NULL 
         OR "commission" IS NULL;
    `);
    
    console.log('✅ Default values set');
    console.log('✅ Table cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupTable();

