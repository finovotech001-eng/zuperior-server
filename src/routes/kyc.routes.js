// server/src/routes/kyc.routes.js

import express from 'express';
import * as kycController from '../controllers/kyc.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protected KYC routes (require authentication)
router.post('/kyc/create', protect, kycController.createKycRecord);
router.put('/kyc/update-document', protect, kycController.updateDocumentStatus);
router.put('/kyc/update-address', protect, kycController.updateAddressStatus);
router.get('/kyc/status', protect, kycController.getKycStatus);

// Webhook callback (no auth required - Shufti Pro calls this)
router.post('/kyc/callback', kycController.handleCallback);

export default router;

