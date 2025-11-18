// otp.service.js
// OTP service for withdrawal and other operations

// In-memory OTP storage: {key: {otp: string, expiresAt: Date, verified: boolean, data: any}}
const otpStore = new Map();

const OTP_EXPIRY_MINUTES = 10;

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiration
 * @param {string} key - Unique key (e.g., userId:email:withdrawal)
 * @param {string} otp - OTP code
 * @param {any} data - Optional data to store with OTP
 * @returns {Date} Expiration date
 */
export function storeOtp(key, otp, data = null) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  otpStore.set(key, {
    otp,
    expiresAt,
    verified: false,
    data,
  });
  return expiresAt;
}

/**
 * Verify OTP
 * @param {string} key - Unique key
 * @param {string} otp - OTP code to verify
 * @returns {{valid: boolean, data: any, message: string}}
 */
export function verifyOtp(key, otp) {
  const otpData = otpStore.get(key);

  if (!otpData) {
    return {
      valid: false,
      data: null,
      message: 'No OTP found. Please request a new OTP.',
    };
  }

  // Check if expired
  if (new Date() > otpData.expiresAt) {
    otpStore.delete(key);
    return {
      valid: false,
      data: null,
      message: 'OTP has expired. Please request a new OTP.',
    };
  }

  // Check if already verified
  if (otpData.verified) {
    return {
      valid: false,
      data: null,
      message: 'This OTP has already been used. Please request a new OTP.',
    };
  }

  // Verify OTP
  if (otpData.otp === otp) {
    // Mark as verified and remove (one-time use)
    otpStore.delete(key);
    return {
      valid: true,
      data: otpData.data,
      message: 'OTP verified successfully.',
    };
  }

  return {
    valid: false,
    data: null,
    message: 'Invalid OTP. Please check and try again.',
  };
}

/**
 * Get OTP data without verifying (for checking if OTP exists)
 * @param {string} key - Unique key
 * @returns {any|null} OTP data or null
 */
export function getOtpData(key) {
  const otpData = otpStore.get(key);
  if (!otpData) return null;

  // Check if expired
  if (new Date() > otpData.expiresAt) {
    otpStore.delete(key);
    return null;
  }

  return otpData.data;
}

/**
 * Delete OTP (cleanup)
 * @param {string} key - Unique key
 */
export function deleteOtp(key) {
  otpStore.delete(key);
}

/**
 * Clean up expired OTPs (can be called periodically)
 */
export function cleanupExpiredOtps() {
  const now = new Date();
  for (const [key, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(key);
    }
  }
}

// Clean up expired OTPs every 5 minutes
setInterval(cleanupExpiredOtps, 5 * 60 * 1000);

