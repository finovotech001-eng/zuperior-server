// Notification Controller

import dbService from '../services/db.service.js';

const prisma = dbService.prisma;

/**
 * Get all notifications for a user
 */
export const getUserNotifications = async (req, res) => {
  try {
    // Check authentication
    if (!req.user || !req.user.id) {
      console.error('❌ No user in request:', { hasUser: !!req.user, userKeys: req.user ? Object.keys(req.user) : [] });
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - user not found in request',
      });
    }

    const userId = req.user.id;
    const { isRead, limit = 50 } = req.query;

    console.log('🔔 Fetching notifications for user:', userId);
    console.log('🔔 Query params:', { isRead, limit });

    // Use raw SQL directly to avoid Prisma client issues
    const limitValue = parseInt(limit, 10) || 50;
    
    let notifications;
    
    try {
      if (isRead !== undefined && isRead !== null) {
        const isReadValue = isRead === 'true' || isRead === true;
        const sql = `SELECT id, "userId", type, title, message, "isRead", metadata, "createdAt", "readAt" FROM "Notification" WHERE "userId" = $1 AND "isRead" = $2 ORDER BY "createdAt" DESC LIMIT $3`;
        console.log('🔔 Executing SQL with isRead filter:', { userId, isRead: isReadValue, limit: limitValue, sql });
        notifications = await prisma.$queryRawUnsafe(sql, userId, isReadValue, limitValue);
      } else {
        const sql = `SELECT id, "userId", type, title, message, "isRead", metadata, "createdAt", "readAt" FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`;
        console.log('🔔 Executing SQL without isRead filter:', { userId, limit: limitValue, sql });
        notifications = await prisma.$queryRawUnsafe(sql, userId, limitValue);
      }
      
      console.log('✅ Raw SQL query successful, found', notifications?.length || 0, 'notifications');
    } catch (sqlError) {
      console.error('❌ SQL query error:', sqlError);
      console.error('❌ SQL error details:', {
        message: sqlError.message,
        code: sqlError.code,
        meta: sqlError.meta,
        stack: sqlError.stack,
      });
      throw sqlError; // Re-throw to be caught by outer try-catch
    }

    // Count unread using raw SQL
    let unreadCount = 0;
    try {
      const countResult = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as count FROM "Notification" WHERE "userId" = $1 AND "isRead" = false`,
        userId
      );
      unreadCount = parseInt(countResult[0]?.count || 0, 10);
      console.log('✅ Unread count:', unreadCount);
    } catch (countError) {
      console.error('❌ Count query error:', countError);
      // Don't fail the whole request if count fails, just set to 0
      unreadCount = 0;
    }

    // Ensure notifications is an array
    const notificationArray = Array.isArray(notifications) ? notifications : [];

    res.status(200).json({
      success: true,
      data: notificationArray,
      unreadCount: unreadCount,
      count: notificationArray.length,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req, res) => {
  try {
    // Check authentication
    if (!req.user || !req.user.id) {
      console.error('❌ No user in request for unread count:', { hasUser: !!req.user, userKeys: req.user ? Object.keys(req.user) : [] });
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - user not found in request',
      });
    }

    const userId = req.user.id;

    console.log('🔔 Fetching unread count for user:', userId);

    // Use raw SQL directly
    let count = 0;
    try {
      const countResult = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int as count FROM "Notification" WHERE "userId" = $1 AND "isRead" = false`,
        userId
      );
      count = parseInt(countResult[0]?.count || 0, 10);
      console.log('✅ Unread count:', count);
    } catch (sqlError) {
      console.error('❌ SQL count query error:', sqlError);
      console.error('❌ SQL error details:', {
        message: sqlError.message,
        code: sqlError.code,
        meta: sqlError.meta,
        stack: sqlError.stack,
      });
      // Don't fail the request, just return 0
      count = 0;
    }

    res.status(200).json({
      success: true,
      unreadCount: count,
    });
  } catch (error) {
    console.error('❌ Error fetching unread count:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.notificationId || req.params.id;

    console.log('🔔 Marking notification as read:', { userId, notificationId });

    // Check if notification exists and belongs to user using raw SQL
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Notification" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      notificationId,
      userId
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Update using raw SQL and return the updated notification
    const updated = await prisma.$queryRawUnsafe(
      `UPDATE "Notification" SET "isRead" = true, "readAt" = NOW() WHERE id = $1 RETURNING *`,
      notificationId
    );

    res.status(200).json({
      success: true,
      data: updated[0] || null,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message,
    });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🔔 Marking all notifications as read for user:', userId);

    // Update using raw SQL
    await prisma.$executeRawUnsafe(
      `UPDATE "Notification" SET "isRead" = true, "readAt" = NOW() WHERE "userId" = $1 AND "isRead" = false`,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message,
    });
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.notificationId || req.params.id;

    console.log('🔔 Deleting notification:', { userId, notificationId });

    // Check if notification exists and belongs to user using raw SQL
    const existing = await prisma.$queryRawUnsafe(
      `SELECT id FROM "Notification" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      notificationId,
      userId
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Delete using raw SQL
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Notification" WHERE id = $1`,
      notificationId
    );

    res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message,
    });
  }
};

/**
 * Create a notification (internal helper function)
 */
export const createNotification = async (userId, type, title, message, metadata = null) => {
  try {
    // Use raw SQL to create notification
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const sql = `
      INSERT INTO "Notification" (id, "userId", type, title, message, "isRead", metadata, "createdAt")
      VALUES (gen_random_uuid(), $1, $2, $3, $4, false, $5::jsonb, NOW())
      RETURNING *
    `;
    
    const result = await prisma.$queryRawUnsafe(
      sql,
      userId,
      type,
      title,
      message,
      metadataJson
    );
    
    const notification = result[0];
    console.log('✅ Notification created:', notification?.id);
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    // Don't throw - notification creation failure shouldn't break main flow
    return null;
  }
};
