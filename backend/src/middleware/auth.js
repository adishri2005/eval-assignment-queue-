// File: src/middleware/auth.js
// Purpose: JWT verification and role-based authorization middleware

const jwt = require('jsonwebtoken');

/**
 * verifyToken — Validates the JWT from the Authorization Bearer header.
 * On success, attaches the decoded payload to req.user and calls next().
 * On failure, returns a 401 JSON response.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required. Provide a valid Bearer token.',
      code: 'AUTH_TOKEN_MISSING',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token has expired. Please log in again.',
        code: 'AUTH_TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      error: 'Invalid authentication token.',
      code: 'AUTH_TOKEN_INVALID',
    });
  }
}

/**
 * requireRole — Middleware factory that checks if the authenticated user's
 * role is in the list of allowed roles. Returns 403 if not authorized.
 *
 * Usage: router.get('/admin', verifyToken, requireRole('coordinator'), handler)
 *
 * @param  {...string} roles - One or more allowed roles
 * @returns {Function} Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}.`,
        code: 'AUTH_FORBIDDEN',
      });
    }

    next();
  };
}

module.exports = { verifyToken, requireRole };
