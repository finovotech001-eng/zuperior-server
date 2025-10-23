// controllers/transactions.controller.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/** Resolve Prisma model regardless of acronym casing in model name */
function getModel(nameOptions) {
  for (const n of nameOptions) if (prisma[n]) return prisma[n];
  throw new Error(`Prisma model not found. Tried: ${nameOptions.join(', ')}`);
}

export const getDatabaseTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { accountId: accountIdRaw, startDate, endDate } =
      req.method === 'GET' ? req.query : req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!accountIdRaw) return res.status(400).json({ success: false, message: 'Account ID is required' });

    const accountIdStr = String(accountIdRaw).trim();

    const MT5Account     = getModel(['mT5Account', 'MT5Account', 'mt5Account', 'Mt5Account']);
    const MT5Transaction = getModel(['mT5Transaction', 'MT5Transaction', 'mt5Transaction', 'Mt5Transaction']);
    const Deposit        = getModel(['deposit', 'Deposit']);
    const Withdrawal     = getModel(['withdrawal', 'Withdrawal']);

    // Verify the account belongs to this user (note: accountId is STRING in your schema)
    const account = await MT5Account.findFirst({
      where: { accountId: accountIdStr, userId },
      select: { id: true, accountId: true }
    });
    if (!account) {
      return res.status(404).json({ success: false, message: 'MT5 account not found or access denied' });
    }

    const dateFilter =
      startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {})
            }
          }
        : {};

    // IMPORTANT: explicit selects to avoid missing columns like `currency`
    const [mt5Transactions, deposits, withdrawals] = await Promise.all([
      MT5Transaction.findMany({
        where: { userId, mt5AccountId: account.id, ...dateFilter },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          type: true,
          status: true,
          comment: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      Deposit.findMany({
        where: { userId, mt5AccountId: account.id, ...dateFilter },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          status: true
          // (omit fields that may not exist, e.g., currency, method, etc.)
        },
        orderBy: { createdAt: 'desc' }
      }),
      Withdrawal.findMany({
        where: { userId, mt5AccountId: account.id, ...dateFilter },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          status: true
          // (omit fields that may not exist, e.g., currency)
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const loginNumber = Number.isNaN(Number(account.accountId))
      ? undefined
      : Number(account.accountId);

    const depositsData = deposits.map(d => ({
      id: `dep_${d.id}`,
      login: loginNumber ?? account.accountId,
      open_time: d.createdAt,
      amount: Number(d.amount ?? 0),
      profit: Number(d.amount ?? 0),
      comment: `Deposit - ${d.id}`,
      type: 'Deposit',
      status: d.status ?? 'Success',
      account_id: account.accountId
    }));

    const withdrawalsData = withdrawals.map(w => ({
      id: `wd_${w.id}`,
      login: loginNumber ?? account.accountId,
      open_time: w.createdAt,
      amount: Number(w.amount ?? 0),
      profit: -Number(w.amount ?? 0),
      comment: `Withdrawal - ${w.id}`,
      type: 'Withdrawal',
      status: w.status ?? 'Success',
      account_id: account.accountId
    }));

    const mt5TransactionsData = mt5Transactions.map(t => ({
      id: `mt5_${t.id}`,
      login: loginNumber ?? account.accountId,
      open_time: t.createdAt,
      amount: Number(t.amount ?? 0),
      profit: t.type === 'Deposit' ? Number(t.amount ?? 0) : -Number(t.amount ?? 0),
      comment: t.comment || `${t.type} - ${t.id}`,
      type: t.type,
      status: t.status ?? 'Success',
      account_id: account.accountId
    }));

    const combined = [...depositsData, ...withdrawalsData, ...mt5TransactionsData].sort(
      (a, b) => new Date(b.open_time).getTime() - new Date(a.open_time).getTime()
    );

    return res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        combined,
        deposits: depositsData,
        withdrawals: withdrawalsData,
        mt5Transactions: mt5TransactionsData,
        bonuses: [],
        status: 'Success',
        MT5_account: account.accountId
      }
    });
  } catch (error) {
    console.error('❌ [getDatabaseTransactions] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};