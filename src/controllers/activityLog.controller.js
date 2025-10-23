// server/src/controllers/activityLog.controller.js

import dbService from '../services/db.service.js';

// Get activity logs with pagination and filters
export const getActivityLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      action = '',
      entity = '',
      userId = '',
      adminId = '',
      startDate = '',
      endDate = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (userId) {
      where.userId = userId;
    }

    if (adminId) {
      where.adminId = adminId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get activity logs with admin details
    const logs = await dbService.prisma.activityLog.findMany({
      where,
      include: {
        admin: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip,
      take: limitNum
    });

    // Get total count for pagination
    const total = await dbService.prisma.activityLog.count({ where });

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs'
    });
  }
};

// Helper function to log activity
export const logActivity = async (userId, adminId, action, entity, details = {}, ipAddress = null, userAgent = null) => {
  try {
    await dbService.prisma.ActivityLog.create({
      data: {
        userId,
        adminId,
        action,
        entity,
        entityId: details.entityId || null,
        ipAddress,
        userAgent,
        oldValues: details.oldValues ? JSON.stringify(details.oldValues) : null,
        newValues: details.newValues ? JSON.stringify(details.newValues) : null
      }
    });
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

// Get activity log statistics
export const getActivityStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get activity counts by action
    const actionStats = await dbService.prisma.activityLog.groupBy({
      by: ['action'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        action: true
      }
    });

    // Get activity counts by entity
    const entityStats = await dbService.prisma.activityLog.groupBy({
      by: ['entity'],
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        entity: true
      }
    });

    // Get daily activity counts
    const dailyStats = await dbService.prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as count
      FROM "ActivityLog"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      data: {
        actionStats,
        entityStats,
        dailyStats,
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics'
    });
  }
};
