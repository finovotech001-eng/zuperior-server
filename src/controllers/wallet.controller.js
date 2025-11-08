import dbService from '../services/db.service.js';
import * as mt5Service from '../services/mt5.service.js';

const generateWalletNumber = () => 'ZUP' + Math.floor(1000000 + Math.random()*9000000);

export const getWallet = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    let wallet = null;
    try {
      if (dbService?.prisma?.wallet) {
        wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) {
          wallet = await dbService.prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD', walletNumber: generateWalletNumber() } });
        } else if (!wallet.walletNumber) {
          wallet = await dbService.prisma.wallet.update({ where: { id: wallet.id }, data: { walletNumber: generateWalletNumber() } });
        }
      }
    } catch (_) {}

    if (!wallet) {
      const rows = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE "userId" = $1 LIMIT 1', userId);
      wallet = rows?.[0] || null;
      if (!wallet) {
        const created = await dbService.prisma.$queryRawUnsafe(
          'INSERT INTO "Wallet" ("id","userId","balance","walletNumber","currency","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, 0, $2, $3, NOW(), NOW()) RETURNING *',
          userId,
          generateWalletNumber(),
          'USD'
        );
        wallet = created?.[0] || null;
      } else if (!wallet.walletNumber) {
        const updated = await dbService.prisma.$queryRawUnsafe(
          'UPDATE "Wallet" SET "walletNumber" = $1, "updatedAt" = NOW() WHERE "id" = $2 RETURNING *',
          generateWalletNumber(),
          wallet.id
        );
        wallet = updated?.[0] || wallet;
      }
    }

    return res.json({ success: true, data: wallet });
  } catch (err) {
    console.error('getWallet error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const mt5ToWallet = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { mt5AccountId, amount } = req.body || {};
    const amt = parseFloat(amount);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!mt5AccountId || !amt || amt <= 0) return res.status(400).json({ success: false, message: 'mt5AccountId and amount required' });

    // Ensure wallet exists (with fallback)
    let wallet = null;
    try {
      if (dbService?.prisma?.wallet) {
        wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet) wallet = await dbService.prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD', walletNumber: generateWalletNumber() } });
      }
    } catch (_) {}
    if (!wallet) {
      const rows = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE "userId" = $1 LIMIT 1', userId);
      wallet = rows?.[0] || null;
      if (!wallet) {
        const created = await dbService.prisma.$queryRawUnsafe(
          'INSERT INTO "Wallet" ("id","userId","balance","walletNumber","currency","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, 0, $2, $3, NOW(), NOW()) RETURNING *',
          userId,
          generateWalletNumber(),
          'USD'
        );
        wallet = created?.[0] || null;
      }
    }

    // Verify MT5 belongs to user
    const account = await dbService.prisma.mT5Account.findFirst({ where: { accountId: String(mt5AccountId), userId }, select: { id: true, accountId: true } });
    if (!account) return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });

    // Withdraw from MT5 to wallet
    const transferResp = await mt5Service.withdrawMt5Balance(account.accountId, amt, `Transfer to Wallet ${wallet.walletNumber}`);
    if (!transferResp?.Success && !transferResp?.success) {
      return res.status(400).json({ success: false, message: transferResp?.Message || transferResp?.message || 'MT5 transfer failed' });
    }

    const description = `From MT5 ${account.accountId} to Wallet ${wallet.walletNumber}`;

    await dbService.prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amt } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, userId, type: 'MT5_TO_WALLET', amount: amt, status: 'completed', description, mt5AccountId: account.accountId } });
      await tx.transaction.create({ data: { userId, type: 'transfer', amount: amt, status: 'completed', currency: 'USD', paymentMethod: 'wallet', description } });
    });

    let updated = null;
    try {
      updated = await dbService.prisma.wallet.findUnique({ where: { id: wallet.id } });
    } catch (_) {}
    if (!updated) {
      const row = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE "id" = $1', wallet.id);
      updated = row?.[0] || wallet;
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('mt5ToWallet error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const walletToMt5 = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { mt5AccountId, amount } = req.body || {};
    const amt = parseFloat(amount);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!mt5AccountId || !amt || amt <= 0) return res.status(400).json({ success: false, message: 'mt5AccountId and amount required' });

    let wallet = null;
    try {
      if (dbService?.prisma?.wallet) wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
    } catch (_) {}
    if (!wallet) {
      const rows = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE "userId" = $1 LIMIT 1', userId);
      wallet = rows?.[0] || null;
    }
    if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
    if ((wallet.balance || 0) < amt) return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });

    const description = `From Wallet ${wallet.walletNumber || ''} to MT5 ${mt5AccountId}`.trim();

    const account = await dbService.prisma.mT5Account.findFirst({ where: { accountId: String(mt5AccountId), userId }, select: { id: true, accountId: true } });
    if (!account) return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });

    const depositResp = await mt5Service.depositMt5Balance(parseInt(account.accountId), amt, description);
    if (!depositResp?.Success) return res.status(400).json({ success: false, message: depositResp?.Message || 'MT5 deposit failed' });

    await dbService.prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amt } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, userId, type: 'WALLET_TO_MT5', amount: amt, status: 'completed', description, mt5AccountId: account.accountId } });
      await tx.transaction.create({ data: { userId, type: 'transfer', amount: amt, status: 'completed', currency: 'USD', paymentMethod: 'wallet', description } });
    });

    let updated = null;
    try { updated = await dbService.prisma.wallet.findUnique({ where: { id: wallet.id } }); } catch (_) {}
    if (!updated) {
      const row = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE "id" = $1', wallet.id);
      updated = row?.[0] || wallet;
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('walletToMt5 error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    let rows = [];
    try {
      rows = await dbService.prisma.walletTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
    } catch (_) {
      rows = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "WalletTransaction" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2', userId, limit);
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getWalletTransactions error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
