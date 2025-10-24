// Quick script to check your CORS configuration
// Run with: node check-cors-config.js

import dotenv from 'dotenv';
dotenv.config();

console.log('\n=== CORS Configuration Check ===\n');

const clientUrl = process.env.CLIENT_URL;
const defaultOrigin = 'http://localhost:3000';

if (!clientUrl) {
    console.log('❌ CLIENT_URL is NOT set');
    console.log(`   Using default: ${defaultOrigin}`);
    console.log('   ⚠️  This will cause CORS errors in production!\n');
    console.log('Fix: Set CLIENT_URL environment variable:');
    console.log('   CLIENT_URL=https://your-frontend-domain.com\n');
} else {
    console.log('✅ CLIENT_URL is set');
    const origins = clientUrl
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    
    console.log(`   Value: ${clientUrl}`);
    console.log(`\nAllowed origins (${origins.length}):`);
    origins.forEach((origin, index) => {
        console.log(`   ${index + 1}. ${origin}`);
    });
    console.log();
    
    // Check for common issues
    let hasIssues = false;
    origins.forEach(origin => {
        if (origin.endsWith('/')) {
            console.log(`⚠️  Warning: ${origin} has trailing slash - remove it`);
            hasIssues = true;
        }
        if (origin.includes('localhost') && origins.length === 1) {
            console.log(`⚠️  Warning: Only localhost is allowed - add production domain`);
            hasIssues = true;
        }
        if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
            console.log(`⚠️  Warning: ${origin} missing protocol (http:// or https://)`);
            hasIssues = true;
        }
    });
    
    if (!hasIssues) {
        console.log('✅ Configuration looks good!\n');
    } else {
        console.log();
    }
}

// Check other important env vars
console.log('=== Other Environment Variables ===\n');

const envVars = [
    { name: 'PORT', value: process.env.PORT, default: '5000' },
    { name: 'DATABASE_URL', value: process.env.DATABASE_URL, required: true },
    { name: 'JWT_SECRET', value: process.env.JWT_SECRET, required: true, hide: true },
];

envVars.forEach(({ name, value, default: defaultVal, required, hide }) => {
    if (value) {
        const displayValue = hide ? '***' : value;
        console.log(`✅ ${name}: ${displayValue}`);
    } else if (defaultVal) {
        console.log(`⚠️  ${name}: Not set (using default: ${defaultVal})`);
    } else if (required) {
        console.log(`❌ ${name}: NOT SET - Required!`);
    } else {
        console.log(`⚠️  ${name}: Not set (optional)`);
    }
});

console.log('\n=== Recommendations ===\n');
if (!clientUrl || clientUrl === defaultOrigin) {
    console.log('1. Set CLIENT_URL to your production frontend domain');
    console.log('2. Restart the server');
    console.log('3. Run this script again to verify\n');
} else {
    console.log('✅ Your CORS configuration is ready!');
    console.log('   Start your server and check the logs for:');
    console.log('   "Allowed CORS origins: [...]"\n');
}

console.log('For detailed setup instructions, see:');
console.log('   - QUICK_CORS_FIX.md (2 minute guide)');
console.log('   - PRODUCTION_SETUP.md (detailed guide)');
console.log('   - CORS_FIX_SUMMARY.md (what changed)\n');

