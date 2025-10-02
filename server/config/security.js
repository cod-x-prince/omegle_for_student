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
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Be aware of this in production
          "https://cdn.socket.io",
          "https://cdn.jsdelivr.net",
          "blob:", // For browser extensions/dev tools
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com", // Allow Google Fonts stylesheets
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com", // Allow Google Fonts files
        ],
        connectSrc: [
          "'self'",
          "wss:",
          "ws:", // For Socket.IO
          "https://*.supabase.co", // For Supabase
        ],
        mediaSrc: [
          "'self'",
          "blob:",
          "data:", // For browser extensions/dev tools
        ],
        imgSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
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

  // CORS configuration - FIXED
  corsConfig: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : [
            "http://localhost:3000",
            "https://pu-c.onrender.com",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
          ];

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
};
