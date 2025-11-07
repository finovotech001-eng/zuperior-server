import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { getWallet, getWalletTransactions, transferFromMt5ToWallet } from '../controllers/wallet.controller.js';

const router = express.Router();

// Get or create the user's wallet
router.get('/wallet', protect, getWallet);

// Get wallet transactions
router.get('/wallet/transactions', protect, getWalletTransactions);

// Transfer funds from an MT5 account to wallet
router.post('/wallet/transfer-from-mt5', protect, transferFromMt5ToWallet);

export default router;

