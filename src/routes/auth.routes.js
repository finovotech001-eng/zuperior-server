// zuperior-dashboard/server/src/routes/auth.routes.js

import express from 'express';
import { login, register } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import dbService from '../services/db.service.js';

const router = express.Router();
// Public routes for authentication
router.post('/register', register);
router.post('/login', login);

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

export default router;