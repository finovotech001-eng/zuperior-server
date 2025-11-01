// userLoginLog.controller.js
// Controller for managing user login activity logs

import dbService from '../services/db.service.js';

const prisma = dbService.prisma;

/**
 * Get login activity for authenticated user
 * GET /api/user/login-activity
 */
export const getUserLoginActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Fetch successful login logs for the user
    const [activities, total] = await Promise.all([
      prisma.UserLoginLog.findMany({
        where: {
          userId: userId,
          success: true, // Only show successful logins
        },
        select: {
          id: true,
          device: true,
          browser: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc', // Newest first
        },
        skip: skip,
        take: limit,
      }),
      prisma.UserLoginLog.count({
        where: {
          userId: userId,
          success: true,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching user login activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch login activity',
      error: error.message,
    });
  }
};

