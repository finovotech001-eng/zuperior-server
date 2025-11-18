// Script to verify group_management table values
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  try {
    const groups = await prisma.$queryRawUnsafe(`
      SELECT 
        id, 
        "group", 
        dedicated_name, 
        account_type, 
        leverage, 
        min_deposit, 
        spread, 
        commission 
      FROM group_management 
      WHERE is_active = true 
      LIMIT 5;
    `);
    
    console.log('Sample groups with values:');
    console.log(JSON.stringify(groups, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verify();

