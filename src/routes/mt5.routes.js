import express from 'express';
import * as mt5Controller from '../controllers/mt5.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// --- Public MT5 Routes ---
// 4.1 Get Groups API - Used during the account creation flow
router.get('/mt5/groups', mt5Controller.getGroups);

// --- Protected MT5 Routes (Require Authentication) ---
// We'll use the protect middleware for routes that interact with a specific user's account

// 2.2 Open MT5 Account API
router.post('/Users', protect, mt5Controller.createAccount);

// 2.3 Deposit API
router.post('/Users/:login/AddClientBalance', protect, mt5Controller.deposit);

// 2.4 Withdraw API
router.post('/Users/:login/DeductClientBalance', protect, mt5Controller.withdraw);

// 2.5 Get User Profile API
router.get('/Users/:login/getClientProfile', protect, mt5Controller.getUserProfile);

// 2.6 Get User's MT5 Accounts from Database
router.get('/mt5/user-accounts', protect, mt5Controller.getUserAccounts);

// 2.7 Internal Transfer API
router.post('/internal-transfer', protect, mt5Controller.internalTransfer);

// 2.8 Store MT5 Account in Database (No auth required - userId passed directly)
router.post('/mt5/store-account', mt5Controller.storeAccount);

export default router;