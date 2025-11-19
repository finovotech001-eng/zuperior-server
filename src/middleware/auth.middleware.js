// server/src/middleware/auth.middleware.js

import jwt from 'jsonwebtoken';
import dbService from '../services/db.service.js';

// JWT Secret - should match the one used in auth.controller.js
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((accumulator, cookiePair) => {
    const trimmed = cookiePair.trim();
    if (!trimmed) return accumulator;
    const [key, ...rest] = trimmed.split('=');
    if (!key) return accumulator;
    accumulator[key] = decodeURIComponent(rest.join('='));
    return accumulator;
  }, {});

const extractToken = (req) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    return req.headers.authorization.split(' ')[1];
  }

  if (req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.token) return cookies.token;
  }

  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
};

// Middleware to protect routes
export const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      console.error('❌ [Auth] No token found in request:', {
        hasAuthHeader: !!req.headers.authorization,
        hasCookie: !!req.headers.cookie,
        hasCookies: !!req.cookies,
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route - no token provided',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('🔐 [Auth] Token verified, clientId:', decoded.clientId);

      // Get user from the token
      const user = await dbService.prisma.User.findFirst({
        where: { clientId: decoded.clientId },
      });

      if (!user) {
        console.error('❌ [Auth] No user found with clientId:', decoded.clientId);
        return res.status(401).json({
          success: false,
          message: 'No user found with this id',
        });
      }

      // Check if user has at least one valid (non-revoked, non-expired) refresh token
      // This ensures that if all tokens are revoked via "logout all devices", 
      // the JWT token is also invalidated
      const now = new Date();
      const validTokenCount = await dbService.prisma.RefreshToken.count({
        where: {
          userId: user.id,
          revoked: {
            not: true, // Not revoked (null or false)
          },
          expiresAt: {
            gt: now, // Not expired
          },
        },
      });

      if (validTokenCount === 0) {
        console.log('❌ [Auth] All refresh tokens revoked for user:', user.id);
        return res.status(401).json({
          success: false,
          message: 'Session has been revoked. Please login again.',
        });
      }

      console.log('✅ [Auth] User authenticated:', { id: user.id, clientId: user.clientId, email: user.email });

      // Set user with parent_id for ticket filtering
      req.user = {
        ...user,
        parent_id: user.clientId || user.id,
      };
      req.token = token;
      next();
    } catch (err) {
      console.error('❌ [Auth] Token verification failed:', {
        error: err.message,
        name: err.name,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route - invalid token',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  } catch (error) {
    console.error('❌ [Auth] Server error in auth middleware:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
    });
    return res.status(500).json({
      success: false,
      message: 'Server error in auth middleware',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Middleware to authorize specific roles
export const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // If no roles specified, allow any authenticated user
    if (roles.length === 0) {
      return next();
    }

    // Check if user's role is in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }

    next();
  };
};
