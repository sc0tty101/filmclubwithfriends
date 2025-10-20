// middleware/rateLimit.js - Simple in-memory rate limiting

const { RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } = require('../config/constants');

// Store request counts in memory
const requestCounts = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.resetTime > RATE_LIMIT_WINDOW_MS) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

function rateLimit(req, res, next) {
  // Use IP address or session ID as identifier
  const identifier = req.session?.userId || req.ip;
  const now = Date.now();

  let userData = requestCounts.get(identifier);

  if (!userData || now - userData.resetTime > RATE_LIMIT_WINDOW_MS) {
    // Create new window
    userData = {
      count: 1,
      resetTime: now
    };
    requestCounts.set(identifier, userData);
    return next();
  }

  if (userData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Please wait a moment before making more requests',
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - userData.resetTime)) / 1000)
    });
  }

  userData.count++;
  next();
}

module.exports = rateLimit;
