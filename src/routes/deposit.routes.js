// server/src/routes/deposit.routes.js

import express from 'express';
import * as depositController from '../controllers/deposit.controller';
import { protect } from '../middleware/auth.middleware';

const router = express.Router();

console.log('Deposit routes loaded');

// Protected routes (require authentication)
// File upload is handled by multer middleware in app.js
router.post('/deposit/create', protect, depositController.createDeposit);
router.get('/deposit/user', protect, depositController.getUserDeposits);
router.get('/deposit/transactions/:accountId', depositController.getTransactionsByAccountId);

// Admin routes (require authentication + admin check)
router.get('/deposit/all', protect, depositController.getAllDeposits);
router.get('/deposit/:id', protect, depositController.getDepositById);
router.put('/deposit/:depositId/status', protect, depositController.updateDepositStatus);
router.get('/deposit/stats/overview', protect, depositController.getDepositStats);

export default router;