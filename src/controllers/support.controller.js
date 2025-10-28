// Support Controller for handling tickets, articles, and FAQ

import dbService from '../services/db.service.js';

const prisma = dbService.prisma;

/**
 * Get all tickets for a user
 */
export const getUserTickets = async (req, res) => {
  try {
    const { parent_id } = req.user;
    const { status, ticket_type, search } = req.query;

    const where = {
      parent_id,
    };

    if (status && status !== 'All') {
      where.status = status;
    }

    if (ticket_type) {
      where.ticket_type = ticket_type;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { ticket_no: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tickets = await prisma.support_tickets.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: tickets,
      count: tickets.length,
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message,
    });
  }
};

/**
 * Get single ticket with replies
 */
export const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { parent_id } = req.user;

    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: parseInt(ticketId),
        parent_id,
      },
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    const replies = await prisma.support_ticket_replies.findMany({
      where: {
        ticket_id: ticket.id,
      },
      orderBy: { created_at: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: {
        ...ticket,
        replies,
      },
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error.message,
    });
  }
};

/**
 * Create a new ticket
 */
export const createTicket = async (req, res) => {
  try {
    // Get user info from req.user (set by auth middleware)
    const parent_id = req.user.clientId || req.user.id; // Use clientId as parent_id
    const email = req.user.email;
    
    const {
      title,
      description,
      ticket_type,
      priority = 'normal',
      account_number,
    } = req.body;

    // Generate ticket number
    const ticketNo = `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const ticket = await prisma.support_tickets.create({
      data: {
        ticket_no: ticketNo,
        parent_id: parent_id.toString(),
        title,
        description,
        ticket_type: ticket_type || 'other',
        priority: priority || 'normal',
        account_number: account_number || null,
        status: 'New',
      },
    });

    // If description exists, create initial reply
    if (description) {
      await prisma.support_ticket_replies.create({
        data: {
          ticket_id: ticket.id,
          sender_id: parent_id.toString(),
          sender_name: email || 'User',
          sender_type: 'user',
          content: description,
          is_read: false,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: ticket,
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket',
      error: error.message,
    });
  }
};

/**
 * Add reply to ticket
 */
export const addReply = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { parent_id, email, name } = req.user;
    const { content, is_internal = false } = req.body;

    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: parseInt(ticketId),
        parent_id,
      },
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found',
      });
    }

    const reply = await prisma.support_ticket_replies.create({
      data: {
        ticket_id: parseInt(ticketId),
        sender_id: parent_id,
        sender_name: name || email || 'User',
        sender_type: 'user',
        content,
        is_internal,
        is_read: false,
      },
    });

    // Update last_reply_at
    await prisma.support_tickets.update({
      where: { id: ticket.id },
      data: {
        updated_at: new Date(),
        last_reply_at: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: reply,
    });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reply',
      error: error.message,
    });
  }
};

/**
 * Get support articles
 */
export const getSupportArticles = async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;

    const where = {
      is_published: true,
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [articles, total] = await Promise.all([
      prisma.support_articles.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { created_at: 'desc' },
      }),
      prisma.support_articles.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: articles,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch articles',
      error: error.message,
    });
  }
};

/**
 * Get single article
 */
export const getArticleBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const article = await prisma.support_articles.findUnique({
      where: { slug },
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found',
      });
    }

    // Increment views
    await prisma.support_articles.update({
      where: { slug },
      data: { views: { increment: 1 } },
    });

    res.status(200).json({
      success: true,
      data: article,
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch article',
      error: error.message,
    });
  }
};

/**
 * Get FAQ items
 */
export const getFAQ = async (req, res) => {
  try {
    const { category, search, limit = 50 } = req.query;

    const where = {
      is_active: true,
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { question: { contains: search, mode: 'insensitive' } },
        { answer: { contains: search, mode: 'insensitive' } },
      ];
    }

    const faqs = await prisma.support_faq.findMany({
      where,
      take: parseInt(limit),
      orderBy: [
        { display_order: 'asc' },
        { created_at: 'desc' },
      ],
    });

    res.status(200).json({
      success: true,
      data: faqs,
      count: faqs.length,
    });
  } catch (error) {
    console.error('Error fetching FAQ:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQ',
      error: error.message,
    });
  }
};

/**
 * Get support categories
 */
export const getSupportCategories = async (req, res) => {
  try {
    const categories = await prisma.support_categories.findMany({
      where: { is_active: true },
      orderBy: { display_order: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
};

