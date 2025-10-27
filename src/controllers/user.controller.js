import dbService, { getUserByEmail } from '../services/db.service.js';
import bcrypt from 'bcryptjs';

export const getUser = async (req, res) => {
  try {
    const { request, email, access_token } = req.body;

    console.log('GetUser request:', { request, email, hasToken: !!access_token });

    if (request !== 'GetUserDetailsByEmail') {
      return res.status(400).json({
        status: 'Error',
        message: 'Invalid request type'
      });
    }

    if (!email || !access_token) {
      return res.status(400).json({
        status: 'Error',
        message: 'Email and access token are required'
      });
    }

    // Get user from database
    const userData = await getUserByEmail(email);

    if (!userData) {
      return res.status(404).json({
        status: 'Error',
        message: 'User not found'
      });
    }

    // Return in the format expected by frontend
    return res.status(200).json({
      status: 'Success',
      data: [userData]
    });

  } catch (error) {
    console.error('Error in getUser:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const user = await dbService.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        clientId: true,
        name: true,
        email: true,
        phone: true,
        country: true,
        status: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const nameParts = (user.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || null;
    const lastName = nameParts.slice(1).join(' ') || null;

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        firstName,
        lastName,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
    });
  }
};

const parseDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date;
  }
  const isoLike = new Date(`${value}T00:00:00Z`);
  if (!Number.isNaN(isoLike.getTime())) {
    return isoLike;
  }
  return undefined;
};

const toEndOfDay = (date) => {
  if (!date) return undefined;
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const mapDepositToResponse = (deposit) => ({
  depositID: deposit.id,
  login: deposit.mt5AccountId,
  open_time: deposit.createdAt?.toISOString?.() ?? deposit.createdAt,
  profit: deposit.amount?.toString?.() ?? String(deposit.amount ?? 0),
  comment: deposit.transactionHash || deposit.method || deposit.paymentMethod || '',
  source: deposit.method || 'Deposit',
  status: deposit.status || 'pending',
});

const mapWithdrawalToResponse = (withdrawal) => ({
  depositID: withdrawal.id,
  login: withdrawal.mt5AccountId,
  open_time: withdrawal.createdAt?.toISOString?.() ?? withdrawal.createdAt,
  profit: withdrawal.amount?.toString?.() ?? String(withdrawal.amount ?? 0),
  comment: withdrawal.walletAddress || withdrawal.bankDetails || withdrawal.method || '',
  source: withdrawal.method || 'Withdrawal',
  status: withdrawal.status || 'pending',
});

export const getTransactions = async (req, res) => {
  try {
    const {
      request,
      account_number: rawAccountNumber,
      accountId: aliasAccountId,
      start_date: rawStart,
      end_date: rawEnd,
    } = req.body || {};

    if (request && request !== 'GetTransactions') {
      return res.status(400).json({
        status: 'Error',
        message: 'Invalid request type',
      });
    }

    const accountId = rawAccountNumber || aliasAccountId;

    if (!accountId) {
      return res.status(400).json({
        status: 'Error',
        message: 'Account number is required',
      });
    }

    const fromDate = parseDate(rawStart);
    const toDate = toEndOfDay(parseDate(rawEnd));

    const dateFilter =
      fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {};

    const [mt5Account, deposits, withdrawals, mt5Transactions] = await Promise.all([
      dbService.prisma.mT5Account.findFirst({
        where: { accountId },
        select: { id: true, userId: true },
      }),
      dbService.prisma.deposit.findMany({
        where: {
          mt5AccountId: accountId,
          ...dateFilter,
        },
        orderBy: { createdAt: 'desc' },
      }),
      dbService.prisma.withdrawal.findMany({
        where: {
          mt5AccountId: accountId,
          ...dateFilter,
        },
        orderBy: { createdAt: 'desc' },
      }),
      dbService.prisma.mT5Transaction.findMany({
        where: {
          mt5Account: { accountId },
          ...dateFilter,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!mt5Account) {
      return res.status(404).json({
        status: 'Error',
        message: 'MT5 account not found',
      });
    }

    const depositMap = deposits.map(mapDepositToResponse);
    const withdrawalMap = withdrawals.map(mapWithdrawalToResponse);
    
    // Map MT5 transactions including Internal Transfers
    const mt5TransactionsMap = mt5Transactions.map((tx) => ({
      id: tx.id,
      login: accountId,
      open_time: tx.createdAt,
      amount: tx.amount,
      profit: tx.type === 'Internal Transfer Out' || tx.type === 'Withdrawal' ? -tx.amount : tx.amount,
      comment: tx.comment || tx.type,
      type: tx.type,
      status: tx.status || 'completed',
      account_id: accountId,
      transactionId: tx.transactionId,
      paymentMethod: tx.paymentMethod,
    }));

    const latestStatus =
      mt5Transactions.find((tx) => tx.status)?.status ||
      depositMap[0]?.status ||
      withdrawalMap[0]?.status ||
      'pending';

    return res.status(200).json({
      status: 'Success',
      status_code: '1',
      MT5_account: accountId,
      lead_id: mt5Account.userId,
      deposits: depositMap,
      withdrawals: withdrawalMap,
      mt5Transactions: mt5TransactionsMap,
      bonuses: [],
      transactions_summary: {
        total_deposits: depositMap.length,
        total_withdrawals: withdrawalMap.length,
        total_internal_transfers: mt5TransactionsMap.filter(tx => 
          tx.type === 'Internal Transfer In' || tx.type === 'Internal Transfer Out'
        ).length,
        last_status: latestStatus,
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({
      status: 'Error',
      message: 'Internal server error',
      error: error.message,
    });
  }
};

// Change password for the authenticated user
export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { oldPassword, newPassword, confirmPassword } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (newPassword.length < 8 || newPassword.length > 100) {
      return res.status(400).json({ success: false, message: 'Password length must be 8-100 characters' });
    }

    const user = await dbService.prisma.user.findUnique({ where: { id: userId }, select: { id: true, password: true } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Old password is incorrect' });
    }

    // Prevent reusing the same password
    const sameAsOld = await bcrypt.compare(newPassword, user.password);
    if (sameAsOld) {
      return res.status(400).json({ success: false, message: 'New password must be different from old password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    await dbService.prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ success: false, message: 'Failed to update password' });
  }
};
