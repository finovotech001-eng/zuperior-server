// zuperior-dashboard/server/src/routes/auth.routes.js

import express from 'express';
import { login, register, logout, refreshToken, verifyTwoFactorLogin } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import dbService from '../services/db.service.js';
import { enableTwoFactor, disableTwoFactor, getTwoFactorStatus } from '../services/twoFactor.service.js';

const router = express.Router();
// Public routes for authentication
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);
router.post('/verify-two-factor-login', verifyTwoFactorLogin);

// Session validity check - 200 if ok, 401 if deleted/missing
router.get('/session/check-valid', protect, async (req, res) => {
  try {
    const user = await dbService.prisma.User.findUnique({ where: { id: req.user.id }, select: { id: true, status: true } });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.status && String(user.status).toLowerCase() === 'deleted') {
      return res.status(401).json({ success: false, message: 'Account deleted' });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Session check failed' });
  }
});

// 2FA routes (protected)
router.post('/two-factor/enable', protect, async (req, res) => {
  try {
    const userId = req.user?.id;
    const email = req.user?.email;

    if (!userId || !email) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await enableTwoFactor(userId, email);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error enabling 2FA:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to enable two-factor authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/two-factor/disable', protect, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const result = await disableTwoFactor(userId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error disabling 2FA:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to disable two-factor authentication' 
    });
  }
});

router.get('/two-factor/status', protect, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const status = await getTwoFactorStatus(userId);
    return res.status(200).json({ success: true, ...status });
  } catch (error) {
    console.error('Error getting 2FA status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get two-factor authentication status' 
    });
  }
});

export default router;