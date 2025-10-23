import express from 'express';
import { getUser, getTransactions, getProfile, changePassword } from '../controllers/user.controller.js';
import { getDatabaseTransactions } from '../controllers/transactions.controller.js';
import { createPaymentMethod, getUserPaymentMethods } from '../controllers/paymentMethod.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/get-user', getUser);
router.post('/transactions/get', getTransactions);
router.get('/transactions/database', protect, getDatabaseTransactions);
router.post('/transactions/database', protect, getDatabaseTransactions);

router.get('/profile', protect, getProfile);

// Change password (authenticated)
router.put('/password', protect, changePassword);

// Payment Methods Routes
router.post('/payment-methods', protect, createPaymentMethod);
router.get('/payment-methods', protect, getUserPaymentMethods);

export default router;
