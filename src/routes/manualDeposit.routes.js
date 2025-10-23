// server/src/routes/manualDeposit.routes.js

import express from 'express';
import * as manualDepositController from '../controllers/manualDeposit.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protected routes (require authentication)
// File upload is handled by multer middleware in app.js
router.post('/manual-deposit/create', protect, manualDepositController.createManualDeposit);
router.get('/manual-deposit/user', protect, manualDepositController.getUserDeposits);

// Admin routes (require authentication + admin check)
router.get('/manual-deposit/all', protect, manualDepositController.getAllDeposits);
router.put('/manual-deposit/:depositId/status', protect, manualDepositController.updateDepositStatus);

export default router;
