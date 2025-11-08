import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { getWallet, mt5ToWallet, walletToMt5, getWalletTransactions } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get('/wallet', protect, getWallet);
router.post('/wallet/mt5-to-wallet', protect, mt5ToWallet);
router.post('/wallet/wallet-to-mt5', protect, walletToMt5);
router.get('/wallet/transactions', protect, getWalletTransactions);

export default router;
