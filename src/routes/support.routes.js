// Support Routes

import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import * as supportController from '../controllers/support.controller.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Ticket routes
router.get('/tickets', supportController.getUserTickets);
router.get('/tickets/:ticketId', supportController.getTicketById);
router.post('/tickets', supportController.createTicket);
router.post('/tickets/:ticketId/replies', supportController.addReply);

// Knowledge base routes
router.get('/articles', supportController.getSupportArticles);
router.get('/articles/:slug', supportController.getArticleBySlug);

// FAQ routes
router.get('/faq', supportController.getFAQ);

// Category routes
router.get('/categories', supportController.getSupportCategories);

export default router;

