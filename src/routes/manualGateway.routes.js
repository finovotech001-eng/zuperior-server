import express from 'express';
import { getManualGateway } from '../controllers/manualGateway.controller.js';

const router = express.Router();

// Public read-only endpoint for bank/wire details
router.get('/manual-gateway', getManualGateway);

export default router;
