// Notification Routes

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as notificationController from '../controllers/notification.controller.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Notification routes
router.get('/', notificationController.getUserNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.put('/:notificationId/read', notificationController.markAsRead);
router.put('/read-all', notificationController.markAllAsRead);
router.delete('/:notificationId', notificationController.deleteNotification);

export default router;
