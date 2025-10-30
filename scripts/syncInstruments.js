const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');

const API_URL = 'http://18.130.5.209:5003/api/Symbols/';
const prisma = new PrismaClient();

async function main() {
  // 1. Fetch all instruments from API
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error('Failed to fetch instruments API');
  const instrumentData = await response.json();
  if (!Array.isArray(instrumentData)) throw new Error('API response is not array');

  // 2. Upsert each instrument
  const instrumentRecords = [];
  for (const sym of instrumentData) {
    // Simple upsert, use symbol as unique
    const dbRecord = await prisma.instrument.upsert({
      where: { symbol: sym.symbol },
      update: {
        name: sym.name || sym.symbol,
        description: sym.description || null,
        category: sym.symbol_type || 'unknown',
        group: sym.group_name || null,
        digits: sym.digits || 5,
        contractSize: sym.contract_size || 100000,
        minVolume: sym.min_volume || 0.01,
        maxVolume: sym.max_volume || 100,
        volumeStep: sym.volume_step || 0.01,
        spread: typeof sym.spread === 'number' ? sym.spread : 0,
        isActive: sym.enable !== undefined ? !!sym.enable : true,
        tradingHours: sym.trading_hours || null,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      },
      create: {
        id: sym.symbol, // Assume symbol IS the id, else use uuid
        symbol: sym.symbol,
        name: sym.name || sym.symbol,
        description: sym.description || null,
        category: sym.symbol_type || 'unknown',
        group: sym.group_name || null,
        digits: sym.digits || 5,
        contractSize: sym.contract_size || 100000,
        minVolume: sym.min_volume || 0.01,
        maxVolume: sym.max_volume || 100,
        volumeStep: sym.volume_step || 0.01,
        spread: typeof sym.spread === 'number' ? sym.spread : 0,
        isActive: sym.enable !== undefined ? !!sym.enable : true,
        tradingHours: sym.trading_hours || null,
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
    instrumentRecords.push(dbRecord);
  }

  // 3. Get all users
  const users = await prisma.user.findMany({ select: { id: true } });
  // 4. Upsert all instruments into UserFavorite for all users
  let count = 0;
  for (const user of users) {
    for (const inst of instrumentRecords) {
      await prisma.userFavorite.upsert({
        where: {
          userId_instrumentId: {
            userId: user.id,
            instrumentId: inst.id,
          }
        },
        update: {},
        create: {
          id: `${user.id}_${inst.id}`,
          userId: user.id,
          instrumentId: inst.id,
          addedAt: new Date(),
        }
      });
      count++;
    }
  }
  console.log(`Done. Upserted ${instrumentRecords.length} instruments for ${users.length} users. Total UserFavorites added/updated: ${count}`);
}

main()
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
