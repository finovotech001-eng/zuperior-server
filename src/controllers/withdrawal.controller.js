import dbService from '../services/db.service.js';
import { sendWithdrawalCreatedEmail, sendOtpEmail } from '../services/email.service.js';
import { createNotification } from './notification.controller.js';
import { generateOtp, storeOtp, verifyOtp } from '../utils/otp.service.js';
// MT5 not required for wallet-based withdrawals

// Request withdrawal - sends OTP to user's email
export const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { amount, walletAddress, method, bankDetails } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    
    const amt = parseFloat(amount);
    const isBank = String(method || '').toLowerCase() === 'bank';
    if (!amt || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }
    
    const address = isBank ? (bankDetails?.accountNumber || walletAddress || '').toString().trim() : (walletAddress || '').toString().trim();
    if (!address) return res.status(400).json({ success: false, message: 'address is required' });

    // Ensure the user has a wallet
    const hasWalletDelegate = Boolean(dbService?.prisma?.wallet);
    let wallet = null;
    if (hasWalletDelegate) {
      wallet = await dbService.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        wallet = await dbService.prisma.wallet.create({ data: { userId, balance: 0, currency: 'USD' } });
      }
    } else {
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

    // Validate wallet balance
    if ((wallet?.balance || 0) < amt) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance. Transfer funds from MT5 to wallet.' });
    }

    // Get user email
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'User email not found' });
    }

    // Generate OTP
    const otp = generateOtp();
    const otpKey = `withdrawal:${userId}:${Date.now()}`;
    
    // Store withdrawal data with OTP
    const withdrawalData = {
      userId,
      amount: amt,
      walletAddress: address,
      method: isBank ? 'bank' : 'crypto',
      bankDetails,
      walletId: wallet.id,
    };
    
    storeOtp(otpKey, otp, withdrawalData);

    // Send OTP email
    try {
      await sendOtpEmail({
        to: userEmail,
        name: req.user?.name,
        otp,
        purpose: 'withdrawal',
      });
      console.log(`✅ Withdrawal OTP sent to ${userEmail}`);
    } catch (emailError) {
      console.error('❌ Failed to send withdrawal OTP email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP email. Please try again.',
      });
    }

    // Return OTP key (frontend will use this to verify)
    return res.status(200).json({
      success: true,
      data: {
        otpKey,
        message: 'OTP sent to your email. Please verify to complete withdrawal.',
      },
    });
  } catch (error) {
    console.error('Error requesting withdrawal:', error?.message || error);
    return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};

// Create a new withdrawal request after OTP verification (USDT TRC20 only)
export const createWithdrawal = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { otpKey, otp } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    
    if (!otpKey || !otp) {
      return res.status(400).json({ success: false, message: 'OTP key and OTP code are required' });
    }

    // Verify OTP
    const verification = verifyOtp(otpKey, otp);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message || 'Invalid or expired OTP',
      });
    }

    // Get withdrawal data from OTP
    const withdrawalData = verification.data;
    if (!withdrawalData || withdrawalData.userId !== userId) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal request' });
    }

    const { amount: amt, walletAddress: address, method, bankDetails, walletId } = withdrawalData;
    const isBank = String(method || '').toLowerCase() === 'bank';
    const currency = 'USD';
    const status = 'pending';
    const paymentMethod = isBank ? 'Bank Transfer' : 'USDT-TRC20';

    // Get wallet (should already exist from request step)
    const hasWalletDelegate = Boolean(dbService?.prisma?.wallet);
    let wallet = null;
    if (hasWalletDelegate) {
      wallet = await dbService.prisma.wallet.findUnique({ where: { id: walletId } });
    } else {
      const rows = await dbService.prisma.$queryRawUnsafe(
        'SELECT * FROM "Wallet" WHERE "id" = $1 LIMIT 1', walletId
      );
      wallet = rows?.[0] || null;
    }

    if (!wallet || wallet.userId !== userId) {
      return res.status(400).json({ success: false, message: 'Invalid wallet' });
    }

    // Validate wallet balance again (in case it changed)
    if ((wallet?.balance || 0) < amt) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance. Transfer funds from MT5 to wallet.' });
    }

    // Create withdrawal (pending) linked to wallet
    let withdrawal = null;
    try {
      withdrawal = await dbService.prisma.withdrawal.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: amt,
          currency,
          method: isBank ? 'bank' : 'crypto',
          paymentMethod,
          walletAddress: address,
          status,
        }
      });
    } catch (prismaErr) {
      console.warn('Prisma withdrawal.create failed, falling back to raw SQL:', prismaErr?.message || prismaErr);
      // Try rich insert with paymentMethod/currency/method if columns exist
      try {
        const rows1 = await dbService.prisma.$queryRawUnsafe(
          'INSERT INTO "Withdrawal" ("id","userId","walletId","amount","method","paymentMethod","walletAddress","status","currency","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *',
          userId,
          wallet.id,
          amt,
          isBank ? 'bank' : 'crypto',
          paymentMethod,
          address,
          status,
          currency
        );
        withdrawal = rows1?.[0];
      } catch (rawErr1) {
        console.warn('Raw SQL insert (rich) failed, trying minimal insert with method:', rawErr1?.message || rawErr1);
        // Minimal insert but include method to satisfy NOT NULL constraints
        const rows2 = await dbService.prisma.$queryRawUnsafe(
          'INSERT INTO "Withdrawal" ("id","userId","walletId","amount","method","status","currency","createdAt","updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *',
          userId,
          wallet.id,
          amt,
          isBank ? 'bank' : 'crypto',
          status,
          currency
        );
        withdrawal = rows2?.[0];
      }
    }

    // Transaction table removed - using Withdrawal and WalletTransaction only
    // Create wallet transaction placeholder (pending)
    await dbService.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: 'WALLET_WITHDRAWAL',
        amount: amt,
        status,
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
          accountLogin: 'WALLET',
          amount: amt,
          date: withdrawal.createdAt,
        });
      }
    } catch (mailErr) {
      console.error('❌ Failed to send withdrawal created email:', mailErr?.message || mailErr);
    }

    // Create notification for withdrawal
    await createNotification(
      userId,
      'withdrawal',
      'Withdrawal Request Created',
      `Your withdrawal request of $${amt.toFixed(2)} has been submitted and is pending approval.`,
      { withdrawalId: withdrawal.id, amount: amt, status: 'pending', method: paymentMethod }
    );

    return res.status(201).json({ success: true, data: { id: withdrawal.id } });
  } catch (error) {
    console.error('Error creating withdrawal:', error?.message || error);
    return res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};
