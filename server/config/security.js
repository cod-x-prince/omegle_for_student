const helmet = require("helmet");
const {
  authLimiter,
  registerLimiter,
  apiLimiter,
  videoChatLimiter,
  adminLimiter,
  healthLimiter,
} = require("../modules/monitoring/rateLimiter");
const logger = require("../utils/logger");

// Enhanced CSP configuration
const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "blob:",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com",
    ],
    scriptSrcElem: [
      "'self'",
      "'unsafe-inline'",
      "blob:",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com",
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com",
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdnjs.cloudflare.com",
    ],
    imgSrc: ["'self'", "data:", "https:", "blob:"],
    connectSrc: [
      "'self'",
      "ws:",
      "wss:",
      "https:",
      "blob:",
      process.env.SUPABASE_URL,
    ],
    mediaSrc: ["'self'", "blob:", "data:"],
    frameSrc: ["'self'", "blob:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
  },
  reportOnly: false,
};

// Enhanced Helmet configuration
const helmetConfig = {
  contentSecurityPolicy: cspConfig,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xFrameOptions: { action: "deny" },
  xContentTypeOptions: true,
  xDownloadOptions: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader("X-Powered-By");

  // Additional security headers not covered by Helmet
  res.setHeader("X-Download-Options", "noopen");

  // Permissions Policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  // Disable caching for sensitive routes
  if (req.path.includes("/auth/") || req.path.includes("/api/")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }

  next();
};

// Enhanced input sanitization
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;

  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/on\w+=/gi, "")
    .replace(/data:/gi, "")
    .replace(/expression\(/gi, "")
    .trim()
    .substring(0, 1000);
};

// HTML sanitization (basic)
const sanitizeHTML = (html) => {
  if (typeof html !== "string") return html;

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*(>|$)/g, "");
};

// Enhanced password validation
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const hasNoSpaces = !/\s/.test(password);
  const hasNoCommonPatterns =
    !/(123456|password|admin|qwerty|12345678|123456789|12345|1234567)/i.test(
      password
    );

  return {
    isValid:
      password.length >= minLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumbers &&
      hasSpecialChar &&
      hasNoSpaces &&
      hasNoCommonPatterns,
    requirements: {
      minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      hasNoSpaces,
      hasNoCommonPatterns,
    },
  };
};

// Session configuration
const sessionConfig = {
  name: "campusconnect.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "strict",
    domain:
      process.env.NODE_ENV === "production" ? ".yourdomain.com" : undefined,
  },
  store: null, // Will be set with your session store
};

// JWT configuration
const jwtConfig = {
  expiresIn: "24h",
  issuer: "campusconnect",
  audience: "campusconnect-users",
  algorithm: "HS256",
};

// CORS configuration
const corsConfig = {
  origin: [
    "https://pu-c.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-CSRF-Token",
  ],
  maxAge: 86400, // 24 hours
};

// Security middleware setup function
const setupSecurity = (app) => {
  logger.info("Setting up enhanced security middleware");

  // Helmet security headers
  app.use(helmet(helmetConfig));

  // Custom security headers
  app.use(securityHeaders);

  // Enhanced rate limiting configuration
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/signup", registerLimiter);
  app.use("/api/auth/reset-password", authLimiter);
  app.use("/api/", apiLimiter);
  app.use("/video-chat", videoChatLimiter);
  app.use("/chat", videoChatLimiter);
  app.use("/api/admin/", adminLimiter);
  app.use("/health", healthLimiter);
  app.use("/api/health", healthLimiter);

  // Security logging middleware
  app.use((req, res, next) => {
    // Log suspicious requests
    const suspiciousPatterns = [
      /\.\.\//, // Directory traversal
      /<script>/i, // Script tags
      /union.*select/i, // SQL injection
      /eval\(/i, // JavaScript eval
    ];

    const isSuspicious = suspiciousPatterns.some(
      (pattern) =>
        pattern.test(req.url) || pattern.test(JSON.stringify(req.body))
    );

    if (isSuspicious) {
      logger.security("Suspicious request detected", {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.get("User-Agent"),
        body: req.body ? JSON.stringify(req.body).substring(0, 200) : "none",
      });
    }

    next();
  });

  logger.info("Enhanced security setup completed");
};

module.exports = {
  helmetConfig,
  securityHeaders,
  sanitizeInput,
  sanitizeHTML,
  validatePassword,
  sessionConfig,
  jwtConfig,
  corsConfig,
  setupSecurity,

  // Export rate limiters for backward compatibility
  rateLimitConfig: authLimiter,
  apiRateLimit: apiLimiter,

  // Export individual limiters for specific use
  authLimiter,
  registerLimiter,
  videoChatLimiter,
  adminLimiter,
  healthLimiter,
};
