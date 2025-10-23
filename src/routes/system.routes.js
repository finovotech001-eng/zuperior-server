import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { testEmail } from '../controllers/system.controller.js';

const router = express.Router();

router.post('/system/test-email', protect, testEmail);

export default router;

