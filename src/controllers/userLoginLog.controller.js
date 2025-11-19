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
 * Returns active refresh tokens that are not revoked and not expired
 */
export const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all non-revoked, non-expired refresh tokens for this user
    const now = new Date();
    
    const activeRefreshTokens = await prisma.RefreshToken.findMany({
      where: {
        userId: userId,
        revoked: {
          not: true, // Not revoked (null or false)
        },
        expiresAt: {
          gt: now, // Not expired
        },
      },
      select: {
        id: true,
        deviceName: true,
        userAgent: true,
        createdAt: true,
        lastActivity: true,
      },
      orderBy: {
        lastActivity: 'desc', // Most recent activity first
      },
    });

    // Transform RefreshToken data to match the expected session format
    const activeSessions = activeRefreshTokens.map(token => {
      // Parse device and browser from deviceName or userAgent
      let device = 'Desktop';
      let browser = 'Unknown Browser';
      
      if (token.deviceName) {
        // deviceName format is usually "Device - Browser" or just "Device"
        const parts = token.deviceName.split(' - ');
        device = parts[0] || 'Desktop';
        browser = parts[1] || 'Unknown Browser';
      } else if (token.userAgent) {
        // Fallback: try to extract from userAgent
        const ua = token.userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
          device = 'Mobile';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
          device = 'Tablet';
        }
        
        if (ua.includes('chrome')) browser = 'Chrome';
        else if (ua.includes('firefox')) browser = 'Firefox';
        else if (ua.includes('safari')) browser = 'Safari';
        else if (ua.includes('edge')) browser = 'Edge';
      }

      return {
        id: token.id,
        device: device,
        browser: browser,
        createdAt: token.createdAt || token.lastActivity,
      };
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
 * Invalidates all sessions by revoking all refresh tokens for the user
 */
export const logoutAllDevices = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Revoke all refresh tokens for this user (if any exist)
    // This is safe even if no tokens exist - updateMany returns { count: 0 }
    try {
      // Update all tokens that are not already revoked (null or false)
      const result = await prisma.RefreshToken.updateMany({
        where: {
          userId: userId,
          revoked: {
            not: true, // Only revoke tokens that aren't already revoked
          },
        },
        data: {
          revoked: true,
          lastActivity: new Date(), // Update last activity when revoking
        },
      });
      console.log(`✅ Revoked ${result.count} refresh tokens for user ${userId}`);
    } catch (tokenError) {
      // If RefreshToken table doesn't exist or has issues, log but don't fail
      console.warn('⚠️ Could not revoke refresh tokens (table may not exist):', tokenError.message);
      console.warn('Token error details:', tokenError);
      // Continue with logout anyway
    }

    // Clear cookies in the response
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    
    res.clearCookie('clientId', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

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

