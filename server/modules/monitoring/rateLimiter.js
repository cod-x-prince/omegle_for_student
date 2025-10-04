const rateLimit = require("express-rate-limit");
const Redis = require("ioredis");
const logger = require("../../utils/logger");

// FIXED: Updated MemoryStore for express-rate-limit v6+
class MemoryStore {
  constructor() {
    this.hits = new Map();
    this.windowMs = 15 * 60 * 1000; // 15 minutes default
    
    // Clean up expired entries every minute
    this.interval = setInterval(() => this.cleanup(), 60000);
  }

  // FIXED: Updated increment method signature for v6+
  async increment(key) {
    const now = Date.now();
    const resetTime = now + this.windowMs;

    if (!this.hits.has(key)) {
      this.hits.set(key, { count: 1, resetTime });
      return {
        totalHits: 1,
        resetTime: new Date(resetTime)
      };
    }

    const entry = this.hits.get(key);
    
    // Reset if window has expired
    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = resetTime;
    } else {
      entry.count++;
    }

    return {
      totalHits: entry.count,
      resetTime: new Date(entry.resetTime)
    };
  }

  async decrement(key) {
    if (this.hits.has(key)) {
      const entry = this.hits.get(key);
      if (entry.count > 0) {
        entry.count--;
      }
    }
  }

  async resetKey(key) {
    this.hits.delete(key);
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (now > entry.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  // Close the interval on shutdown
  close() {
    clearInterval(this.interval);
  }
}

// FIXED: Redis store for express-rate-limit v6+
class RedisStore {
  constructor(redisClient) {
    this.client = redisClient;
    this.prefix = "rate_limit:";
    this.windowMs = 15 * 60 * 1000;
  }

  async increment(key) {
    const redisKey = this.prefix + key;
    const now = Date.now();
    const resetTime = now + this.windowMs;

    try {
      const pipeline = this.client.pipeline();
      
      // Remove expired entries
      pipeline.zremrangebyscore(redisKey, 0, now - this.windowMs);
      
      // Add current request
      pipeline.zadd(redisKey, now, now.toString());
      
      // Set expiration
      pipeline.expire(redisKey, Math.ceil(this.windowMs / 1000));
      
      // Get count
      pipeline.zcard(redisKey);
      
      const results = await pipeline.exec();
      const count = results[3][1]; // zcard result

      return {
        totalHits: count,
        resetTime: new Date(resetTime)
      };
    } catch (error) {
      logger.error("Redis store error:", error);
      // Fallback: allow the request if Redis fails
      return {
        totalHits: 1,
        resetTime: new Date(resetTime)
      };
    }
  }

  async decrement(key) {
    // Not typically implemented for rate limiting
  }

  async resetKey(key) {
    const redisKey = this.prefix + key;
    return this.client.del(redisKey);
  }
}

// Redis client setup
let redisClient = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected for rate limiting");
    });

    redisClient.on("error", (err) => {
      logger.error("Redis connection error:", err);
    });
  } catch (error) {
    logger.error("Failed to initialize Redis for rate limiting:", error);
    redisClient = null;
  }
}

// FIXED: Create rate limiters with proper configuration
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = "Too many requests, please try again later.",
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    useRedis = false,
  } = options;

  // Use memory store by default (more reliable)
  const store = new MemoryStore();
  store.windowMs = windowMs;

  return rateLimit({
    windowMs,
    max,
    message: {
      error: "Rate limit exceeded",
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
        ip: req.ip,
        path: req.path,
        userAgent: req.get("User-Agent"),
      });

      res.status(429).json({
        error: "Rate limit exceeded",
        message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
    store, // FIXED: Use the store instance directly
  });
};

// Global rate limiters
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again later.",
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true,
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many API requests, please try again later.",
});

const videoLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Video session limit exceeded, please try again later.",
});

const mfaLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many MFA verification attempts, please try again later.",
  skipSuccessfulRequests: true,
});

const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many registration attempts, please try again later.",
});

const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many admin requests, please try again later.",
});

const videoChatLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Too many video chat requests, please try again later.",
});

// Export rate limiters
module.exports = {
  globalLimiter,
  authLimiter,
  apiLimiter,
  videoLimiter,
  mfaLimiter,
  registerLimiter,
  adminLimiter,
  videoChatLimiter,
  createRateLimiter,
  RedisStore,
  MemoryStore,
};