const rateLimit = require("express-rate-limit");
const logger = require("../../utils/logger");

// Custom store for rate limiting
class CustomStore {
  constructor() {
    this.hits = new Map();
  }

  increment(key, windowMs, cb) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const keyData = this.hits.get(key) || {
      count: 0,
      resetTime: windowStart + windowMs,
    };

    if (now > keyData.resetTime) {
      keyData.count = 1;
      keyData.resetTime = windowStart + windowMs;
    } else {
      keyData.count++;
    }

    this.hits.set(key, keyData);

    // Cleanup old entries
    this.cleanup();

    cb(null, keyData.count, keyData.resetTime);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.hits.entries()) {
      if (now > data.resetTime + 60000) {
        this.hits.delete(key);
      }
    }
  }
}

// Enhanced rate limiter creator
const createRateLimiter = (options) => {
  return rateLimit({
    store: new CustomStore(),
    handler: (req, res) => {
      logger.security("Rate limit exceeded", {
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get("User-Agent"),
      });

      res.status(429).json({
        error: "Too many requests",
        message: options.message || "Please try again later.",
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
    skip: (req) => {
      // Skip rate limiting for localhost in development
      return req.ip === "127.0.0.1" && process.env.NODE_ENV !== "production";
    },
    ...options,
  });
};

// Authentication rate limits
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many login attempts. Please try again in 15 minutes.",
  skipSuccessfulRequests: true,
});

// Registration rate limits
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 accounts per hour per IP
  message: "Too many account creation attempts. Please try again later.",
});

// API rate limits
const apiLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many API requests. Please slow down.",
});

// Video chat specific limits
const videoChatLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 pairing attempts per 5 minutes
  message: "Too many video chat requests. Please wait before trying again.",
});

// WebSocket message limits
const wsMessageLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute
  message: "Message rate limit exceeded. Please slow down.",
});

// File upload limits
const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 uploads per 10 minutes
  message: "Too many file uploads. Please wait before uploading again.",
});

// Password reset limits
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: "Too many password reset attempts. Please try again later.",
});

// Admin endpoints rate limiting
const adminLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for admin
  message: "Too many admin requests. Please slow down.",
});

// Health check rate limiting
const healthLimiter = createRateLimiter({
  windowMs: 30 * 1000, // 30 seconds
  max: 10, // 10 health checks per 30 seconds
  message: "Too many health check requests.",
});

module.exports = {
  authLimiter,
  registerLimiter,
  apiLimiter,
  videoChatLimiter,
  wsMessageLimiter,
  uploadLimiter,
  passwordResetLimiter,
  adminLimiter,
  healthLimiter,
  createRateLimiter,
};
