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
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Get user from the token
      const user = await dbService.prisma.user.findFirst({
        where: { clientId: decoded.clientId },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'No user found with this id',
        });
      }

      req.user = user;
      req.token = token;
      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error in auth middleware',
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
