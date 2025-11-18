// twoFactor.service.js
// Service for managing two-factor authentication

import dbService from './db.service.js';
import { generateOtp, storeOtp, verifyOtp } from '../utils/otp.service.js';
import { sendOtpEmail } from './email.service.js';

/**
 * Enable 2FA for a user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function enableTwoFactor(userId, email) {
  try {
    await dbService.prisma.User.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    console.log(`✅ 2FA enabled for user: ${userId}`);
    return {
      success: true,
      message: 'Two-factor authentication has been enabled successfully.',
    };
  } catch (error) {
    console.error('Error enabling 2FA:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    throw new Error(error.message || 'Failed to enable two-factor authentication');
  }
}

/**
 * Disable 2FA for a user
 * @param {string} userId - User ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function disableTwoFactor(userId) {
  try {
    await dbService.prisma.User.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    });

    console.log(`✅ 2FA disabled for user: ${userId}`);
    return {
      success: true,
      message: 'Two-factor authentication has been disabled successfully.',
    };
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    throw new Error('Failed to disable two-factor authentication');
  }
}

/**
 * Send 2FA OTP email for login
 * @param {string} email - User email
 * @param {string} name - User name
 * @returns {Promise<{success: boolean, otpKey: string, message: string}>}
 */
export async function sendTwoFactorOTP(email, name) {
  try {
    // Generate OTP
    const otp = generateOtp();
    const otpKey = `2fa-login:${email}:${Date.now()}`;

    // Store OTP with user email as data
    storeOtp(otpKey, otp, { email, name });

    // Send OTP email
    await sendOtpEmail({
      to: email,
      name: name || 'User',
      otp,
      purpose: 'two-factor-login',
    });

    console.log(`✅ 2FA OTP sent to ${email}`);
    return {
      success: true,
      otpKey,
      message: 'OTP sent to your email. Please check your inbox.',
    };
  } catch (error) {
    console.error('Error sending 2FA OTP:', error);
    throw new Error('Failed to send OTP email');
  }
}

/**
 * Verify 2FA OTP during login
 * @param {string} otpKey - OTP key from sendTwoFactorOTP
 * @param {string} otp - OTP code entered by user
 * @param {string} email - User email (for validation)
 * @returns {Promise<{valid: boolean, data: any, message: string}>}
 */
export async function verifyTwoFactorOTP(otpKey, otp, email) {
  try {
    // Verify OTP
    const verification = verifyOtp(otpKey, otp);

    if (!verification.valid) {
      return verification;
    }

    // Validate email matches
    if (verification.data && verification.data.email !== email) {
      return {
        valid: false,
        data: null,
        message: 'Email mismatch. Please try again.',
      };
    }

    return verification;
  } catch (error) {
    console.error('Error verifying 2FA OTP:', error);
    return {
      valid: false,
      data: null,
      message: 'Failed to verify OTP. Please try again.',
    };
  }
}

/**
 * Get 2FA status for a user
 * @param {string} userId - User ID
 * @returns {Promise<{enabled: boolean}>}
 */
export async function getTwoFactorStatus(userId) {
  try {
    const user = await dbService.prisma.User.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    return {
      enabled: user?.twoFactorEnabled || false,
    };
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    return { enabled: false };
  }
}

