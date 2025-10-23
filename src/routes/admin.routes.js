// server/src/routes/admin.routes.js

import express from 'express';
import { protect, authorize } from '../middleware/auth.middleware.js';

// Import admin controllers
import * as adminController from '../controllers/admin.controller.js';
import * as adminStatsController from '../controllers/adminStats.controller.js';
import * as adminDepositController from '../controllers/adminDeposit.controller.js';
import * as adminKycController from '../controllers/adminKyc.controller.js';
import * as adminWithdrawalController from '../controllers/adminWithdrawal.controller.js';
import * as activityLogController from '../controllers/activityLog.controller.js';
import * as paymentMethodController from '../controllers/paymentMethod.controller.js';

const router = express.Router();

// Apply authentication and admin authorization to all routes
router.use(protect);
router.use(authorize(['admin']));

// User Management Routes
router.get('/users/export/csv', adminController.exportUsers);
router.get('/users', adminController.getAllUsers);
router.get('/users/:id/mt5-accounts', adminController.getUserMt5Accounts);
router.get('/users/:id/stats', adminController.getUserStats);
router.get('/users/:id/ban', adminController.banUser);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);

// Deposit Management Routes
router.get('/deposits', adminDepositController.getAllManualDeposits);
router.get('/deposits/:id', adminDepositController.getDepositById);
router.put('/deposits/:id/approve', adminDepositController.approveDeposit);
router.put('/deposits/:id/reject', adminDepositController.rejectDeposit);
router.get('/deposits/stats', adminDepositController.getDepositStats);

// KYC Management Routes
router.get('/kyc', adminKycController.getAllKycRequests);
router.get('/kyc/:id', adminKycController.getKycById);
router.put('/kyc/:id/status', adminKycController.updateKycStatus);
router.get('/kyc/:id/document-url', adminKycController.getKycDocumentUrl);
router.get('/kyc/stats', adminKycController.getKycStats);

// Withdrawal Management Routes
router.get('/withdrawals', adminWithdrawalController.getAllWithdrawals);
router.get('/withdrawals/:id', adminWithdrawalController.getWithdrawalById);
router.put('/withdrawals/:id/approve', adminWithdrawalController.approveWithdrawal);
router.put('/withdrawals/:id/reject', adminWithdrawalController.rejectWithdrawal);
router.get('/withdrawals/stats', adminWithdrawalController.getWithdrawalStats);

// Payment Method Management Routes
router.get('/payment-methods', paymentMethodController.getAllPaymentMethods);
router.put('/payment-methods/:id/approve', paymentMethodController.approvePaymentMethod);
router.put('/payment-methods/:id/reject', paymentMethodController.rejectPaymentMethod);

// Activity Log Routes
router.get('/activity-logs', activityLogController.getActivityLogs);
router.get('/activity-logs/stats', activityLogController.getActivityStats);

// Stats Routes
router.get('/stats/dashboard', adminStatsController.getDashboardStats);
router.get('/stats/deposits', adminStatsController.getDepositStats);
router.get('/stats/withdrawals', adminStatsController.getWithdrawalStats);
router.get('/stats/kyc', adminKycController.getKycStats);
router.get('/stats/activity-logs', activityLogController.getActivityStats);

export default router;

