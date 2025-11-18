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
    console.log(`🔍 [getDatabaseTransactions] accountId: ${accountIdStr}, userId: ${userId}`);

    const MT5Account = getModel(['mT5Account', 'MT5Account', 'mt5Account', 'Mt5Account']);
    const MT5Transaction = getModel(['mT5Transaction', 'MT5Transaction', 'mt5Transaction', 'Mt5Transaction']);
    const Wallet = getModel(['wallet', 'Wallet']);
    const Deposit = getModel(['deposit', 'Deposit']);
    // Use prisma.Withdrawal directly to ensure correct model access
    const Withdrawal = prisma.Withdrawal || getModel(['withdrawal', 'Withdrawal']);
    const WalletTransaction = getModel(['walletTransaction', 'WalletTransaction']);

    // Build date filter
    const dateFilter = startDate || endDate
      ? { createdAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
      : {};

    // Check if it's a wallet account (by walletNumber) or MT5 account
    const wallet = await Wallet.findFirst({
      where: { walletNumber: accountIdStr, userId },
      select: { id: true, walletNumber: true }
    });

    if (wallet) {
      // Handle wallet transactions
      console.log(`✅ Found wallet ${accountIdStr}`);
      
      const walletTransactions = await WalletTransaction.findMany({
        where: { userId, ...dateFilter },
        orderBy: { createdAt: 'desc' }
      });

      const depositsData = [];
      const withdrawalsData = [];
      const mt5TransactionsData = [];

      walletTransactions.forEach(t => {
        const baseData = {
          login: accountIdStr,
          open_time: t.createdAt,
          amount: Number(t.amount ?? 0),
          status: t.status || 'Success',
          account_id: accountIdStr,
          transactionId: null
        };

        const isDeposit = t.type === 'MT5_TO_WALLET' || t.type === 'WALLET_DEPOSIT';
        const isWithdrawal = t.type === 'WALLET_WITHDRAWAL' || t.type === 'WALLET_TO_MT5';

        const transactionData = {
          id: `wt_${t.id}`,
          ...baseData,
          profit: isDeposit ? Number(t.amount ?? 0) : -Number(t.amount ?? 0),
          comment: t.description || t.type || 'Wallet Transaction',
          type: t.type
        };

        mt5TransactionsData.push(transactionData);

        if (isDeposit) {
          depositsData.push({
            ...transactionData,
            id: `dep_${t.id}`,
            type: 'Deposit'
          });
        } else if (isWithdrawal) {
          withdrawalsData.push({
            ...transactionData,
            id: `wd_${t.id}`,
            type: 'Withdrawal'
          });
        }
      });

      const combined = [...mt5TransactionsData].sort(
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
          MT5_account: accountIdStr
        }
      });
    }

    // Handle MT5 account
    const account = await MT5Account.findFirst({
      where: { accountId: accountIdStr, userId },
      select: { id: true, accountId: true }
    });
    
    if (!account) {
      console.error(`❌ Account ${accountIdStr} not found for user ${userId}`);
      return res.status(404).json({ success: false, message: 'Account not found or access denied' });
    }
    
    console.log(`✅ Found MT5 account ${accountIdStr}, internal id: ${account.id}`);

    // ONLY use Deposit and Withdrawal tables - no MT5Transaction
    let deposits = [];
    let withdrawals = [];
    
    try {
      // Query deposits
      deposits = await Deposit.findMany({
        where: { mt5AccountId: account.id, ...dateFilter },
        orderBy: { createdAt: 'desc' }
      });
      console.log(`✅ Deposits query successful: ${deposits.length} found`);
    } catch (depositError) {
      console.error(`❌ Error querying deposits:`, depositError.message);
    }

    try {
      // Query withdrawals - try prisma.Withdrawal directly first
      if (prisma.Withdrawal) {
        withdrawals = await prisma.Withdrawal.findMany({
          where: { mt5AccountId: account.id, ...dateFilter },
          orderBy: { createdAt: 'desc' }
        });
        console.log(`✅ Withdrawals query successful (prisma.Withdrawal): ${withdrawals.length} found`);
      } else {
        withdrawals = await Withdrawal.findMany({
          where: { mt5AccountId: account.id, ...dateFilter },
          orderBy: { createdAt: 'desc' }
        });
        console.log(`✅ Withdrawals query successful (getModel): ${withdrawals.length} found`);
      }
    } catch (withdrawalError) {
      console.error(`❌ Error querying withdrawals with Prisma:`, withdrawalError.message);
      console.error(`❌ Error stack:`, withdrawalError.stack);
      console.log(`🔍 Attempting raw SQL query as fallback...`);
      
      // Fallback to raw SQL query
      try {
        const rawWithdrawals = await prisma.$queryRawUnsafe(
          `SELECT id, "mt5AccountId", amount, method, "paymentMethod", status, "createdAt", "userId", currency, "externalTransactionId" FROM "Withdrawal" WHERE "mt5AccountId" = $1 ORDER BY "createdAt" DESC`,
          account.id
        );
        console.log(`📊 Raw SQL query found ${Array.isArray(rawWithdrawals) ? rawWithdrawals.length : 0} withdrawals`);
        if (Array.isArray(rawWithdrawals) && rawWithdrawals.length > 0) {
          withdrawals = rawWithdrawals.map(w => ({
            id: w.id,
            mt5AccountId: w.mt5AccountId,
            amount: parseFloat(w.amount),
            method: w.method,
            paymentMethod: w.paymentMethod,
            status: w.status,
            createdAt: w.createdAt,
            userId: w.userId,
            currency: w.currency,
            externalTransactionId: w.externalTransactionId
          }));
          console.log(`📋 Converted ${withdrawals.length} withdrawals from raw query`);
        }
      } catch (rawError) {
        console.error(`❌ Error running raw query:`, rawError.message);
      }
    }

    console.log(`✅ Final count: ${deposits.length} Deposits, ${withdrawals.length} Withdrawals for account ${accountIdStr} (mt5AccountId: ${account.id})`);
    
    // Debug: Always check raw query to verify data exists
    if (withdrawals.length === 0) {
      console.log(`🔍 Debugging: Checking withdrawals in database for mt5AccountId: ${account.id}`);
      try {
        const rawWithdrawals = await prisma.$queryRawUnsafe(
          `SELECT id, "mt5AccountId", amount, method, "paymentMethod", status, "createdAt" FROM "Withdrawal" WHERE "mt5AccountId" = $1 LIMIT 5`,
          account.id
        );
        console.log(`📊 Raw SQL verification found ${Array.isArray(rawWithdrawals) ? rawWithdrawals.length : 0} withdrawals`);
        if (Array.isArray(rawWithdrawals) && rawWithdrawals.length > 0) {
          console.log(`📋 Sample raw withdrawal:`, rawWithdrawals[0]);
          console.log(`⚠️ WARNING: Withdrawals exist in DB but Prisma query returned 0!`);
        } else {
          console.log(`⚠️ No withdrawals found in database for mt5AccountId: ${account.id}`);
        }
      } catch (rawError) {
        console.error(`❌ Error running raw query:`, rawError.message);
      }
    } else {
      console.log(`📋 Sample withdrawal from query:`, {
        id: withdrawals[0].id,
        mt5AccountId: withdrawals[0].mt5AccountId,
        amount: withdrawals[0].amount,
        method: withdrawals[0].method,
        paymentMethod: withdrawals[0].paymentMethod,
        status: withdrawals[0].status,
        createdAt: withdrawals[0].createdAt
      });
    }

    // Map transactions from Deposit and Withdrawal tables ONLY
    const loginNumber = Number.isNaN(Number(account.accountId)) ? undefined : Number(account.accountId);
    const depositsData = [];
    const withdrawalsData = [];
    const mt5TransactionsData = [];

    // Map Deposits from Deposit table
    deposits.forEach(d => {
      const isInternalTransfer = d.paymentMethod === 'internal_transfer' || d.method === 'internal_transfer';
      const depositData = {
        id: `dep_${d.id}`,
        login: loginNumber ?? account.accountId,
        open_time: d.createdAt,
        amount: Number(d.amount ?? 0),
        profit: Number(d.amount ?? 0),
        status: d.status || 'Success',
        account_id: account.accountId,
        comment: isInternalTransfer ? 'Internal Transfer Deposit' : (d.method || d.paymentMethod || 'Deposit'),
        type: isInternalTransfer ? 'Internal Transfer' : 'Deposit',
        transactionId: d.externalTransactionId || null
      };
      
      depositsData.push(depositData);
      mt5TransactionsData.push({ ...depositData, id: `mt5_dep_${d.id}`, type: 'Deposit' });
    });

    // Map Withdrawals from Withdrawal table
    console.log(`🔄 Mapping ${withdrawals.length} withdrawals...`);
    withdrawals.forEach((w, index) => {
      const isInternalTransfer = w.paymentMethod === 'internal_transfer' || w.method === 'internal_transfer';
      const withdrawalData = {
        id: `wd_${w.id}`,
        login: loginNumber ?? account.accountId,
        open_time: w.createdAt,
        amount: Number(w.amount ?? 0),
        profit: -Number(w.amount ?? 0),
        status: w.status || 'Success',
        account_id: account.accountId,
        comment: isInternalTransfer ? 'Internal Transfer Withdrawal' : (w.method || w.paymentMethod || 'Withdrawal'),
        type: isInternalTransfer ? 'Internal Transfer' : 'Withdrawal',
        transactionId: w.externalTransactionId || null
      };
      
      withdrawalsData.push(withdrawalData);
      mt5TransactionsData.push({ ...withdrawalData, id: `mt5_wd_${w.id}`, type: 'Withdrawal' });
      
      if (index === 0) {
        console.log(`📋 First withdrawal mapped:`, withdrawalData);
      }
    });

    console.log(`✅ Mapped: ${depositsData.length} deposits, ${withdrawalsData.length} withdrawals, ${mt5TransactionsData.length} total transactions`);
    console.log(`📤 Returning response with ${withdrawalsData.length} withdrawals in withdrawalsData array`);

    // Sort combined array
    const combined = [...mt5TransactionsData].sort(
      (a, b) => new Date(b.open_time).getTime() - new Date(a.open_time).getTime()
    );

    const responseData = {
      combined,
      deposits: depositsData,
      withdrawals: withdrawalsData,
      mt5Transactions: mt5TransactionsData,
      bonuses: [],
      status: 'Success',
      MT5_account: account.accountId
    };

    console.log(`📤 Final response data:`, {
      depositsCount: responseData.deposits.length,
      withdrawalsCount: responseData.withdrawals.length,
      combinedCount: responseData.combined.length,
      mt5TransactionsCount: responseData.mt5Transactions.length
    });

    return res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: responseData
    });
  } catch (error) {
    console.error('❌ [getDatabaseTransactions] Error:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};
