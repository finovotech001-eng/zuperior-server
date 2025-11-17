import express from 'express';
import { getUser, getTransactions, getProfile, changePassword, sendOtp, verifyOtp, resetPassword } from '../controllers/user.controller.js';
import { getDatabaseTransactions } from '../controllers/transactions.controller.js';
import { createPaymentMethod, getUserPaymentMethods } from '../controllers/paymentMethod.controller.js';
import { getUserLoginActivity, getActiveSessions, logoutAllDevices } from '../controllers/userLoginLog.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/get-user', getUser);
router.post('/transactions/get', getTransactions);
router.get('/transactions/database', protect, getDatabaseTransactions);
router.post('/transactions/database', protect, getDatabaseTransactions);

router.get('/profile', protect, getProfile);

// Change password (authenticated)
router.put('/password', protect, changePassword);

// OTP and Password Reset Routes (no authentication required)
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// Payment Methods Routes
router.post('/payment-methods', protect, createPaymentMethod);
router.get('/payment-methods', protect, getUserPaymentMethods);

// Login Activity Routes
router.get('/login-activity', protect, getUserLoginActivity);
router.get('/active-sessions', protect, getActiveSessions);
router.post('/logout-all-devices', protect, logoutAllDevices);

export default router;
