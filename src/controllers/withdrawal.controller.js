import dbService from '../services/db.service.js';

// Create a new withdrawal request (USDT TRC20 only)
export const createWithdrawal = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { mt5AccountId, amount, walletAddress } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    const amt = parseFloat(amount);
    if (!mt5AccountId || !amt || amt <= 0 || !walletAddress) {
      return res.status(400).json({ success: false, message: 'mt5AccountId, amount and walletAddress are required' });
    }

    // Verify MT5 account belongs to user
    const account = await dbService.prisma.mT5Account.findFirst({
      where: { accountId: String(mt5AccountId), userId },
      select: { id: true }
    });
    if (!account) return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });

    // Create withdrawal record (pending)
    const withdrawal = await dbService.prisma.withdrawal.create({
      data: {
        userId,
        mt5AccountId: account.id,
        amount: amt,
        currency: 'USD',
        method: 'crypto',
        paymentMethod: 'USDT-TRC20',
        walletAddress: walletAddress,
        status: 'pending',
      }
    });

    // Transaction entry
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

    // MT5 audit entry (pending)
    await dbService.prisma.mT5Transaction.create({
      data: {
        type: 'Withdrawal',
        amount: amt,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'USDT-TRC20',
        transactionId: withdrawal.id,
        comment: `USDT-TRC20 withdrawal request - ${withdrawal.id}`,
        withdrawalId: withdrawal.id,
        userId: userId,
        mt5AccountId: account.id,
      }
    });

    return res.status(201).json({ success: true, data: { id: withdrawal.id } });
  } catch (error) {
    console.error('Error creating withdrawal:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

