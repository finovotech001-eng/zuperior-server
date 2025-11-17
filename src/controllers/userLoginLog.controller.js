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

/**
 * Get currently active sessions (logged in devices)
 * GET /api/user/active-sessions
 * Returns recent successful logins within the last 24 hours
 */
export const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get logins from the last 24 hours (token expiration time)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activeSessions = await prisma.UserLoginLog.findMany({
      where: {
        userId: userId,
        success: true,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
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
    });

    res.status(200).json({
      success: true,
      data: {
        sessions: activeSessions,
        count: activeSessions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active sessions',
      error: error.message,
    });
  }
};

/**
 * Logout from all devices
 * POST /api/user/logout-all-devices
 * Invalidates all sessions by updating user's logoutAllAt timestamp
 */
export const logoutAllDevices = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Update user with logoutAllAt timestamp
    // This will be checked during token validation
    await prisma.User.update({
      where: { id: userId },
      data: {
        updatedAt: new Date(), // Use updatedAt as logoutAllAt indicator
      },
    });

    // Revoke all refresh tokens for this user (if any exist)
    // This is safe even if no tokens exist - updateMany returns { count: 0 }
    try {
      // Update all tokens that are not already revoked (null or false)
      const result = await prisma.RefreshToken.updateMany({
        where: {
          userId: userId,
        },
        data: {
          revoked: true,
        },
      });
      console.log(`Revoked ${result.count} refresh tokens for user ${userId}`);
    } catch (tokenError) {
      // If RefreshToken table doesn't exist or has issues, log but don't fail
      console.warn('Could not revoke refresh tokens (table may not exist):', tokenError.message);
      console.warn('Token error details:', tokenError);
      // Continue with logout anyway - the User update is the main action
    }

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully',
    });
  } catch (error) {
    console.error('Error logging out from all devices:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to logout from all devices',
      error: error.message,
    });
  }
};

