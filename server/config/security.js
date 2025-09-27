const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const constants = require("./constants");

// Security middleware configuration
module.exports = {
  // Helmet security headers
  helmetConfig: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "wss:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: "same-origin" },
  }),

  // Rate limiting
  rateLimitConfig: rateLimit({
    windowMs:
      parseInt(process.env.RATE_LIMIT_WINDOW_MS) ||
      constants.RATE_LIMIT_WINDOW_MS,
    max:
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) ||
      constants.RATE_LIMIT_MAX_REQUESTS,
    message: { error: constants.ERRORS.RATE_LIMITED },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // CORS configuration
  corsConfig: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
};
