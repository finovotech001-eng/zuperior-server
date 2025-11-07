import dbService from '../services/db.service.js';
import { sendWithdrawalCreatedEmail } from '../services/email.service.js';
import * as mt5Service from '../services/mt5.service.js';

// Create a new withdrawal request (USDT TRC20 only)
export const createWithdrawal = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { mt5AccountId, amount, walletAddress } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !walletAddress) {
      return res.status(400).json({ success: false, message: 'amount and walletAddress are required' });
    }

    // Ensure the user has a wallet (supports environments where Prisma client isn't regenerated yet)
    const hasWalletDelegate = Boolean(dbService?.prisma?.wallet);
    let wallet = null;
    if (hasWalletDelegate) {
      wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await dbService.prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD' } });
      }
    } else {
      // Raw fallback
      const rows = await dbService.prisma.$queryRawUnsafe(
        'SELECT * FROM "Wallet" WHERE "userId" = $1 LIMIT 1', userId
      );
      wallet = rows?.[0] || null;
      if (!wallet) {
        const created = await dbService.prisma.$queryRawUnsafe(
          'INSERT INTO "Wallet" ("id","userId","balance","currency","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, 0, $2, NOW(), NOW()) RETURNING *',
          userId,
          'USD'
        );
        wallet = created?.[0];
      }
    }

    let linkedMt5InternalId = null;

    // If an MT5 account is provided, attempt to transfer funds to wallet first
    if (mt5AccountId) {
      // Verify MT5 account belongs to user
      const account = await dbService.prisma.mT5Account.findFirst({
        where: { accountId: String(mt5AccountId), userId },
        select: { id: true, accountId: true }
      });
      if (!account) return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });
      linkedMt5InternalId = account.id;

      // Withdraw from MT5
      try {
        const transferResp = await mt5Service.withdrawMt5Balance(account.accountId, amt, `Transfer to Wallet for withdrawal`);
        if (!transferResp?.Success && !transferResp?.success) {
          return res.status(400).json({ success: false, message: transferResp?.Message || transferResp?.message || 'MT5 transfer failed' });
        }
      } catch (mt5Err) {
        console.error('MT5 withdraw error:', mt5Err?.message || mt5Err);
        return res.status(400).json({ success: false, message: 'Unable to transfer from MT5. Please try again later.' });
      }

      // Credit wallet and record transaction
      if (hasWalletDelegate) {
        await dbService.prisma.$transaction(async (tx) => {
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amt } } });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              userId,
              type: 'MT5_TO_WALLET',
              amount: amt,
              status: 'completed',
              description: `Transfer from MT5 ${account.accountId}`,
              mt5AccountId: account.accountId,
            }
          });
          await tx.mT5Transaction.create({
            data: {
              type: 'Internal Transfer Out',
              amount: amt,
              status: 'completed',
              paymentMethod: 'Wallet Transfer',
              transactionId: `wallet:${wallet.id}`,
              comment: `Transfer to Wallet`,
              mt5AccountId: account.id,
              userId,
            }
          });
        });
      } else {
        // Raw SQL fallbacks
        await dbService.prisma.$executeRawUnsafe(
          'UPDATE "Wallet" SET "balance" = "balance" + $1, "updatedAt" = NOW() WHERE id = $2', amt, wallet.id
        );
        await dbService.prisma.$executeRawUnsafe(
          'INSERT INTO "WalletTransaction" ("id","walletId","userId","type","amount","status","description","mt5AccountId","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
          wallet.id, userId, 'MT5_TO_WALLET', amt, 'completed', `Transfer from MT5 ${account.accountId}`, account.accountId
        );
        await dbService.prisma.$executeRawUnsafe(
          'INSERT INTO "MT5Transaction" ("id","type","amount","status","paymentMethod","transactionId","comment","mt5AccountId","userId","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())',
          'Internal Transfer Out', amt, 'completed', 'Wallet Transfer', `wallet:${wallet.id}`, 'Transfer to Wallet', account.id, userId
        );
      }

      // Refresh wallet
      if (hasWalletDelegate) {
        wallet = await dbService.prisma.wallet.findUnique({ where: { id: wallet.id } });
      } else {
        const rows2 = await dbService.prisma.$queryRawUnsafe('SELECT * FROM "Wallet" WHERE id = $1', wallet.id);
        wallet = rows2?.[0] || wallet;
      }
    }

    // Validate wallet balance
    if ((wallet?.balance || 0) < amt) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance. Transfer funds from MT5 to wallet.' });
    }

    // Create withdrawal (pending) linked to wallet
    const withdrawal = await dbService.prisma.withdrawal.create({
      data: {
        userId,
        mt5AccountId: linkedMt5InternalId,
        walletId: wallet.id,
        amount: amt,
        currency: 'USD',
        method: 'crypto',
        paymentMethod: 'USDT-TRC20',
        walletAddress: walletAddress,
        status: 'pending',
      }
    });

    // General transaction entry
    await dbService.prisma.transaction.create({
      data: {
        userId,
        type: 'withdrawal',
        amount: amt,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'USDT-TRC20',
        description: `USDT-TRC20 withdrawal request - ${withdrawal.id}`,
        withdrawalId: withdrawal.id,
      }
    });

    // Create wallet transaction placeholder (pending)
    await dbService.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: 'WALLET_WITHDRAWAL',
        amount: amt,
        status: 'pending',
        description: `Withdrawal request - ${withdrawal.id}`,
        withdrawalId: withdrawal.id,
      }
    });

    // Notify user via email (fire-and-forget)
    try {
      const to = req.user?.email;
      if (to) {
        await sendWithdrawalCreatedEmail({
          to,
          userName: req.user?.name,
          accountLogin: mt5AccountId || 'WALLET',
          amount: amt,
          date: withdrawal.createdAt,
        });
      }
    } catch (mailErr) {
      console.error('❌ Failed to send withdrawal created email:', mailErr?.message || mailErr);
    }

    return res.status(201).json({ success: true, data: { id: withdrawal.id } });
  } catch (error) {
    console.error('Error creating withdrawal:', error?.message || error);
    return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};
