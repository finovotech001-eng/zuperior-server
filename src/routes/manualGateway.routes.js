import express from 'express';
import { getManualGateway } from '../controllers/manualGateway.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// optional auth; using protect ensures user context when needed
router.get('/manual-gateway', protect, getManualGateway);

export default router;

