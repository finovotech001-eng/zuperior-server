// server/src/controllers/wallet.controller.js

import dbService from '../services/db.service.js';
import * as mt5Service from '../services/mt5.service.js';

const ensureUserWallet = async (userId, tx = null) => {
  const prisma = tx || dbService.prisma;
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD' } });
  }
  return wallet;
};

export const getWallet = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const wallet = await ensureUserWallet(userId);
    return res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const { page = 1, limit = 25 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const skip = (pageNum - 1) * limitNum;

    const wallet = await ensureUserWallet(userId);

    const [items, total] = await Promise.all([
      dbService.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      dbService.prisma.walletTransaction.count({ where: { walletId: wallet.id } })
    ]);

    return res.status(200).json({ success: true, data: { items, total, page: pageNum, limit: limitNum } });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Transfer from an MT5 account (login) to the user's Wallet
export const transferFromMt5ToWallet = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { mt5AccountId, amount, comment } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    const amt = parseFloat(amount);
    if (!mt5AccountId || !amt || amt <= 0) {
      return res.status(400).json({ success: false, message: 'mt5AccountId and positive amount are required' });
    }

    // Verify account belongs to user
    const account = await dbService.prisma.mT5Account.findFirst({
      where: { accountId: String(mt5AccountId), userId },
      select: { id: true, accountId: true }
    });
    if (!account) return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });

    // Optional: sanity check available balance
    try {
      const profile = await mt5Service.getMt5UserProfile(account.accountId);
      const bal = parseFloat(profile?.Balance || 0);
      if (Number.isFinite(bal) && bal < amt) {
        return res.status(400).json({ success: false, message: `Insufficient MT5 balance. Available: $${bal.toFixed(2)}` });
      }
    } catch (e) {
      // If profile check fails, still try transfer via MT5 API and rely on its validation
      console.warn('Unable to verify MT5 balance before transfer:', e?.message || e);
    }

    // Withdraw from MT5
    const withdrawResp = await mt5Service.withdrawMt5Balance(
      account.accountId,
      amt,
      comment || `Transfer to Wallet`
    );

    if (!withdrawResp?.Success && !withdrawResp?.success) {
      return res.status(400).json({ success: false, message: withdrawResp?.Message || withdrawResp?.message || 'MT5 withdrawal failed' });
    }

    // Credit wallet and record transaction atomically
    const result = await dbService.prisma.$transaction(async (tx) => {
      const wallet = await ensureUserWallet(userId, tx);

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amt } }
      });

      const wtx = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'MT5_TO_WALLET',
          amount: amt,
          status: 'completed',
          description: comment || `Transfer from MT5 ${account.accountId}`,
          mt5AccountId: account.accountId,
        }
      });

      // Also log in MT5Transaction table for audit
      await tx.mT5Transaction.create({
        data: {
          type: 'Internal Transfer Out',
          amount: amt,
          status: 'completed',
          paymentMethod: 'Wallet Transfer',
          transactionId: wtx.id,
          comment: `Transfer to Wallet - ${wtx.id}`,
          mt5AccountId: account.id,
          userId,
        }
      });

      return { updatedWallet, wtx };
    });

    return res.status(200).json({ success: true, data: { wallet: result.updatedWallet, transaction: result.wtx } });
  } catch (error) {
    console.error('Error transferring from MT5 to wallet:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export default {
  getWallet,
  getWalletTransactions,
  transferFromMt5ToWallet,
};

