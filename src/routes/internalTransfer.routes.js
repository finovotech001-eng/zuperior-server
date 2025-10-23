import express from 'express';
import * as internalTransferController from '../controllers/internalTransfer.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// Internal transfer endpoint - requires authentication
router.post('/internal-transfer', protect, internalTransferController.internalTransfer);

export default router;