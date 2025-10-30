const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();
const FILE_PATH = '/tmp/instruments.json';

function mapApiToInstrument(apiObj) {
  return {
    id: apiObj.Symbol, // Use symbol as id
    symbol: apiObj.Symbol,
    name: apiObj.Description || apiObj.Symbol,
    description: apiObj.Description || null,
    category: apiObj.Path ? apiObj.Path.split('\\')[1] || 'unknown' : 'unknown',
    group: apiObj.Path || null,
    digits: apiObj.Digits ?? 5,
    contractSize: apiObj.ContractSize ?? 100000,
    minVolume: apiObj.VolumeMin ?? 0.01,
    maxVolume: apiObj.VolumeMax ?? 100,
    volumeStep: apiObj.VolumeStep ?? 0.01,
    spread: typeof apiObj.Spread === 'number' ? apiObj.Spread : 0,
    isActive: apiObj.Enable !== undefined ? !!apiObj.Enable : true,
    tradingHours: null,
    lastUpdated: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function main() {
  // 1. Load all instruments from JSON file
  const raw = fs.readFileSync(FILE_PATH, 'utf-8');
  const instrumentData = JSON.parse(raw);
  if (!Array.isArray(instrumentData)) throw new Error('API response is not array');

  // 2. Upsert each instrument
  const instrumentRecords = [];
  for (const apiObj of instrumentData) {
    if (!apiObj.Symbol) continue;
    const mapped = mapApiToInstrument(apiObj);
    const dbRecord = await prisma.instrument.upsert({
      where: { symbol: mapped.symbol },
      update: { ...mapped, createdAt: undefined, id: undefined },
      create: mapped
    });
    instrumentRecords.push(dbRecord);
  }

  // 3. Get all users
  const users = await prisma.user.findMany({ select: { id: true } });
  const favourites = [
    'xaususdm',
    'btcusdm',
    'eurusdm',
    'eurusd',
    'xauusd',
    'btcusd',
    'ethusd'
  ];
  // 4. Upsert all instruments into UserFavorite for all users
  let count = 0;
  for (const user of users) {
    for (const inst of instrumentRecords) {
      if (!favourites.includes(inst.symbol.toLowerCase())) continue;
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
