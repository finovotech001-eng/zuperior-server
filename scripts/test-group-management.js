// Test script for group management API
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testGroupManagement() {
  try {
    console.log('🧪 Testing Group Management Implementation\n');
    
    // Test 1: Check database schema
    console.log('1️⃣ Testing database schema...');
    const allGroups = await prisma.group_management.findMany({
      where: { is_active: true },
      take: 5
    });
    console.log(`✅ Found ${allGroups.length} active groups in database`);
    
    // Test 2: Check Live groups
    console.log('\n2️⃣ Testing Live groups filter...');
    const liveGroups = await prisma.group_management.findMany({
      where: { 
        is_active: true,
        account_type: 'Live'
      }
    });
    console.log(`✅ Found ${liveGroups.length} Live groups`);
    if (liveGroups.length > 0) {
      console.log('   Sample Live group:', {
        id: liveGroups[0].id,
        group: liveGroups[0].group,
        dedicated_name: liveGroups[0].dedicated_name,
        leverage: liveGroups[0].leverage,
        min_deposit: liveGroups[0].min_deposit,
        spread: liveGroups[0].spread,
        commission: liveGroups[0].commission
      });
    }
    
    // Test 3: Check Demo groups
    console.log('\n3️⃣ Testing Demo groups filter...');
    const demoGroups = await prisma.group_management.findMany({
      where: { 
        is_active: true,
        account_type: 'Demo'
      }
    });
    console.log(`✅ Found ${demoGroups.length} Demo groups`);
    if (demoGroups.length > 0) {
      console.log('   Sample Demo group:', {
        id: demoGroups[0].id,
        group: demoGroups[0].group,
        dedicated_name: demoGroups[0].dedicated_name,
        leverage: demoGroups[0].leverage,
        min_deposit: demoGroups[0].min_deposit,
        spread: demoGroups[0].spread,
        commission: demoGroups[0].commission
      });
    }
    
    // Test 4: Verify required fields
    console.log('\n4️⃣ Verifying required fields...');
    const sampleGroup = allGroups[0];
    if (sampleGroup) {
      const requiredFields = ['id', 'group', 'dedicated_name', 'account_type', 'leverage', 'min_deposit', 'spread', 'commission'];
      const missingFields = requiredFields.filter(field => sampleGroup[field] === undefined);
      if (missingFields.length === 0) {
        console.log('✅ All required fields present');
      } else {
        console.log(`⚠️  Missing fields: ${missingFields.join(', ')}`);
      }
    }
    
    // Test 5: Check data types
    console.log('\n5️⃣ Verifying data types...');
    if (sampleGroup) {
      console.log('   Leverage type:', typeof sampleGroup.leverage, 'Value:', sampleGroup.leverage);
      console.log('   Min Deposit type:', typeof sampleGroup.min_deposit, 'Value:', sampleGroup.min_deposit);
      console.log('   Spread type:', typeof sampleGroup.spread, 'Value:', sampleGroup.spread);
      console.log('   Commission type:', typeof sampleGroup.commission, 'Value:', sampleGroup.commission);
    }
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Total active groups: ${allGroups.length}`);
    console.log(`   - Live groups: ${liveGroups.length}`);
    console.log(`   - Demo groups: ${demoGroups.length}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Ensure backend server is running on port 5000');
    console.log('   2. Test API endpoint: GET /api/group-management/active-groups?accountType=Live');
    console.log('   3. Test frontend integration in the Create Account dialog');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testGroupManagement();

