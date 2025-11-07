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

    // Ensure the user has a wallet
    let wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await dbService.prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD' } });
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
      const transferResp = await mt5Service.withdrawMt5Balance(account.accountId, amt, `Transfer to Wallet for withdrawal`);
      if (!transferResp?.Success && !transferResp?.success) {
        return res.status(400).json({ success: false, message: transferResp?.Message || transferResp?.message || 'MT5 transfer failed' });
      }

      // Credit wallet and record transaction
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

      // Refresh wallet
      wallet = await dbService.prisma.wallet.findUnique({ where: { id: wallet.id } });
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
    console.error('Error creating withdrawal:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
