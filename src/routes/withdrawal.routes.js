import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as withdrawalController from '../controllers/withdrawal.controller.js';

const router = express.Router();

// Request withdrawal (sends OTP)
router.post('/withdraw/request', protect, withdrawalController.requestWithdrawal);

// Create withdrawal after OTP verification
router.post('/withdraw/create', protect, withdrawalController.createWithdrawal);

export default router;

