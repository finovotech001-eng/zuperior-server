// server/src/routes/cregis.routes.js

import express from 'express';
import * as cregisController from '../controllers/cregis.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

console.log('Cregis routes loaded');

// Public routes (webhook - no auth required)
router.post('/cregis/payment-callback', cregisController.handlePaymentCallback);

// Protected routes (require authentication)
router.post('/cregis/create-payment', protect, cregisController.createPaymentOrder);
router.post('/cregis/query-payment', protect, cregisController.queryPaymentOrder);
router.get('/cregis/currencies', protect, cregisController.getPaymentCurrencies);
router.post('/cregis/create-withdrawal', protect, cregisController.createWithdrawalOrder);

export default router;


