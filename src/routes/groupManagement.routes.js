// zuperior-server/src/routes/groupManagement.routes.js

import express from 'express';
import * as groupManagementController from '../controllers/groupManagement.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// GET /api/group-management/active-groups
// Optional query param: accountType (Live/Demo)
router.get('/active-groups', protect, groupManagementController.getActiveGroups);

export default router;

