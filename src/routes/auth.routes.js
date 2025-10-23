// zuperior-dashboard/server/src/routes/auth.routes.js

import express from 'express';
import { login, register, forgotPassword, resetPassword } from '../controllers/auth.controller.js';

const router = express.Router();
// Public routes for authentication
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;