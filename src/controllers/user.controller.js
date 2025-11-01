import dbService, { getUserByEmail } from '../services/db.service.js';
import bcrypt from 'bcryptjs';
import { sendOtpEmail } from '../services/email.service.js';

// In-memory OTP storage: {email: {otp: string, expiresAt: Date, verified: boolean}}
const otpStore = new Map();
// Store verified emails for password reset (expires after 15 minutes)
const verifiedEmails = new Map();
const OTP_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_EXPIRY_MINUTES = 15;

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

    const user = await dbService.prisma.User.findUnique({
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

    const user = await dbService.prisma.User.findUnique({ where: { id: userId }, select: { id: true, password: true } });
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

    await dbService.prisma.User.update({ where: { id: userId }, data: { password: hashed } });

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ success: false, message: 'Failed to update password' });
  }
};

// Send OTP for password reset
export const sendOtp = async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt,
      verified: false
    });

    // Send OTP email
    try {
      await sendOtpEmail({ to: email, name: name || 'User', otp });
      console.log(`✅ OTP sent to ${email}`);
      
      return res.status(200).json({
        success: true,
        message: `OTP sent to ${email}`
      });
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      // Remove OTP from store if email failed
      otpStore.delete(email.toLowerCase());
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email'
      });
    }
  } catch (error) {
    console.error('Error in sendOtp:', error);
    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// Verify OTP for password reset or email verification
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Email and OTP are required'
      });
    }

    const emailLower = email.toLowerCase();
    const otpData = otpStore.get(emailLower);

    // Check if OTP exists
    if (!otpData) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'No OTP found for this email. Please request a new OTP.'
      });
    }

    // Check if OTP has expired
    if (new Date() > otpData.expiresAt) {
      otpStore.delete(emailLower);
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Check if OTP has already been verified
    if (otpData.verified) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'This OTP has already been used. Please request a new OTP.'
      });
    }

    // Verify OTP
    if (otpData.otp === otp) {
      // Remove OTP from store (one-time use)
      otpStore.delete(emailLower);
      
      // If purpose is email_verification, update emailVerified in database
      if (purpose === 'email_verification') {
        try {
          await dbService.prisma.User.updateMany({
            where: { email: emailLower },
            data: { emailVerified: true }
          });
          console.log(`✅ Email verified for ${emailLower}`);
        } catch (dbError) {
          console.error('Error updating emailVerified:', dbError);
          // Don't fail the request if DB update fails, but log it
        }
      } else {
        // Store verified email for password reset (expires after 15 minutes)
        verifiedEmails.set(emailLower, new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000));
      }
      
      return res.status(200).json({
        success: true,
        verified: true,
        message: purpose === 'email_verification' 
          ? 'Email verified successfully.' 
          : 'OTP verified successfully.'
      });
    } else {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }
  } catch (error) {
    console.error('Error in verifyOtp:', error);
    return res.status(500).json({
      success: false,
      verified: false,
      message: 'Failed to verify OTP'
    });
  }
};

// Reset password after OTP verification
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    const emailLower = email.toLowerCase();

    // Check if email was verified via OTP
    const verifiedUntil = verifiedEmails.get(emailLower);
    if (!verifiedUntil) {
      return res.status(400).json({
        success: false,
        message: 'Email not verified. Please verify OTP first.'
      });
    }

    // Check if verification has expired
    if (new Date() > verifiedUntil) {
      verifiedEmails.delete(emailLower);
      return res.status(400).json({
        success: false,
        message: 'Verification expired. Please request a new OTP.'
      });
    }

    // Validate password
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Find user by email
    const user = await getUserByEmail(email);
    if (!user) {
      // Remove verified email even if user not found (security)
      verifiedEmails.delete(emailLower);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in database
    await dbService.prisma.User.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    // Remove verified email from store (one-time use)
    verifiedEmails.delete(emailLower);

    console.log(`✅ Password reset successful for user: ${email}`);
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Helper function to check if email is verified (for cleanup)
export const isEmailVerified = (email) => {
  const emailLower = email.toLowerCase();
  const verifiedUntil = verifiedEmails.get(emailLower);
  if (!verifiedUntil) return false;
  if (new Date() > verifiedUntil) {
    verifiedEmails.delete(emailLower);
    return false;
  }
  return true;
};

// Helper function to remove verified email
export const removeVerifiedEmail = (email) => {
  verifiedEmails.delete(email.toLowerCase());
};
