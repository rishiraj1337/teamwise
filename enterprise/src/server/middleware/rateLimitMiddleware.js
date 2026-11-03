'use strict';

/**
 * Enterprise Rate Limiter Middleware
 * Uses an in-memory sliding window algorithm per client IP address.
 */
function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 100,
  message = 'Too many requests, please try again later.',
  keyGenerator = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim()) : (req.socket?.remoteAddress || req.ip || '127.0.0.1');
    return ip;
  },
} = {}) {
  const store = new Map();

  // Periodic cleanup of expired windows every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 120 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
}

const authLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,     // 10 attempts per minute for auth operations
  message: 'Too many authentication attempts. Please wait 1 minute before trying again.',
});

const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 300,    // 300 requests per minute
  message: 'API rate limit exceeded. Please throttle your requests.',
});

module.exports = {
  createRateLimiter,
  authLimiter,
  generalApiLimiter,
};
