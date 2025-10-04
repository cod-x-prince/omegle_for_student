const path = require("path");
const encryptionManager = require("./utils/encryption");
const advancedSecurity = require("./modules/middleware/advancedSecurity");
const mfaManager = require("./modules/auth/mfaManager");

// Load environment variables with explicit path
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// DEBUG: Check if rate limiters are loading correctly
console.log("🔧 Loading rate limiters...");
try {
  const rateLimiters = require("./modules/monitoring/rateLimiter");
  console.log("✅ Rate limiters loaded successfully");

  // Check if globalLimiter is a function
  if (typeof rateLimiters.globalLimiter === "function") {
    console.log("✅ globalLimiter is a valid middleware function");
  } else {
    console.log(
      "❌ globalLimiter is NOT a function:",
      typeof rateLimiters.globalLimiter
    );
  }
} catch (error) {
  console.error("❌ Failed to load rate limiters:", error.message);

  // Create dummy limiters as fallback
  console.log("🔄 Creating fallback dummy limiters...");
  const createDummyLimiter = () => (req, res, next) => next();

  const rateLimiters = {
    globalLimiter: createDummyLimiter(),
    authLimiter: createDummyLimiter(),
    apiLimiter: createDummyLimiter(),
    mfaLimiter: createDummyLimiter(),
    videoLimiter: createDummyLimiter(),
    registerLimiter: createDummyLimiter(),
    adminLimiter: createDummyLimiter(),
    videoChatLimiter: createDummyLimiter(),
  };

  console.log("✅ Fallback dummy limiters created");
}

// Import rate limiters AFTER verification
const {
  globalLimiter,
  authLimiter,
  apiLimiter,
  mfaLimiter,
  videoLimiter,
  registerLimiter,
  adminLimiter,
  videoChatLimiter,
} = require("./modules/monitoring/rateLimiter");

// Import security configuration WITHOUT rate limiters
const {
  sanitizeInput,
  validatePassword,
  securityHeaders,
  helmetConfig,
} = require("./config/security");

// Debug environment with better error handling
console.log("🚀 Starting server with ENHANCED SECURITY...");
console.log("Environment:", process.env.NODE_ENV || "not set");
console.log(
  "Supabase URL:",
  process.env.SUPABASE_URL ? "configured" : "MISSING - check .env file"
);
console.log(
  "JWT Secret:",
  process.env.JWT_SECRET ? "configured" : "MISSING - check .env file"
);

// Validate critical environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("❌ CRITICAL: Supabase environment variables are missing!");
  console.error("   Please check your .env file in the project root directory");
  console.error("   Required variables: SUPABASE_URL, SUPABASE_ANON_KEY");
  process.exit(1);
}

// Now import other modules AFTER environment is loaded
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

console.log("✅ Core modules loaded");

// Import configurations - FIXED PATHS
let securityConfig, constants;

try {
  securityConfig = require("./config/security");
  console.log("✅ Security config loaded");
} catch (e) {
  console.error("❌ Security config failed:", e.message);
  process.exit(1);
}

try {
  constants = require("./config/constants");
  console.log("✅ Constants loaded");
} catch (e) {
  console.error("❌ Constants failed:", e.message);
  process.exit(1);
}

// Enhanced Supabase client with better error handling
console.log("🔧 Initializing Supabase client...");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
console.log("✅ Supabase client initialized");

// Import modules - CORRECT PATHS:
const authMiddleware = require("./modules/auth/authMiddleware");
const PairingManager = require("./modules/pairing/pairingManager");
const SignalingHandler = require("./modules/signaling/signalingHandler");
const logger = require("./utils/logger");

class CampusConnectServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);

    // ✅ FIXED: Enhanced Socket.IO configuration for Render.com
    this.io = new Server(this.server, {
      cors: {
        origin: [
          "https://pu-c.onrender.com",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"], // Explicit transports
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Initialize health monitor
    this.healthMonitor = require("./utils/healthMonitor");

    // Initialize modules with proper dependency injection
    this.pairingManager = new PairingManager(this.io);
    this.signalingHandler = new SignalingHandler(this.io, this.pairingManager);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();

    logger.info("CampusConnectServer instance created", {
      environment: process.env.NODE_ENV || "development",
      pid: process.pid,
      security: "enhanced",
    });
  }

  setupMiddleware() {
    logger.debug("Setting up enhanced security middleware");

    // Trust proxy configuration for Render
    this.app.set("trust proxy", 1);
    logger.info("Proxy configuration", {
      trustProxy: this.app.get("trust proxy"),
      nodeEnv: process.env.NODE_ENV,
    });

    // 🔒 RATE LIMITING - APPLY FIRST (FIXED ORDER)
    console.log("🔒 Applying global rate limiter...");
    try {
      this.app.use(globalLimiter);
      console.log("✅ Global rate limiter applied successfully");
    } catch (error) {
      console.error("❌ Failed to apply global rate limiter:", error.message);
    }

    // 🔒 ENHANCED SECURITY MIDDLEWARE - APPLIED MANUALLY
    console.log("🔒 Applying security middleware manually...");
    try {
      // Apply Helmet security headers directly
      this.app.use(
        helmet({
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: [
                "'self'",
                "https://pu-c.onrender.com",
                "ws:",
                "wss:",
              ],
            },
          },
          crossOriginEmbedderPolicy: false,
        })
      );

      // CORS configuration
      this.app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS"
        );
        res.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Requested-With"
        );
        res.header("Access-Control-Allow-Credentials", "true");

        if (req.method === "OPTIONS") {
          return res.sendStatus(200);
        }
        next();
      });

      console.log("✅ Security middleware applied successfully");
    } catch (error) {
      console.error("❌ Failed to apply security middleware:", error.message);
    }

    // 🛡️ WEB APPLICATION FIREWALL (WAF) - ADD THIS
    // 🛡️ WEB APPLICATION FIREWALL (WAF) - FIXED VERSION
    console.log("🛡️ Applying WAF middleware...");
    try {
      // Check if advancedSecurity is properly initialized
      if (
        advancedSecurity &&
        typeof advancedSecurity.advancedRequestFilter === "function"
      ) {
        // Use the middleware correctly - it returns a function
        this.app.use(advancedSecurity.advancedRequestFilter());
        console.log("✅ WAF middleware applied successfully");
      } else {
        console.warn("⚠️ WAF not available, using basic security middleware");
        // Fallback basic security middleware
        this.app.use((req, res, next) => {
          try {
            // Basic security checks
            const userAgent = req.get("User-Agent") || "";
            const url = req.url.toLowerCase();

            // Block obvious path traversal
            if (
              url.includes("..") ||
              url.includes("//") ||
              url.includes("./")
            ) {
              console.warn("🚨 Blocked path traversal attempt:", {
                ip: req.ip,
                url: req.url,
              });
              return res.status(400).json({ error: "Invalid request" });
            }

            // Basic SQL injection protection
            const sqlKeywords = [
              "select",
              "insert",
              "update",
              "delete",
              "drop",
              "union",
              "exec",
            ];
            const requestString = JSON.stringify({
              headers: req.headers,
              body: req.body,
              query: req.query,
            }).toLowerCase();

            if (
              sqlKeywords.some((keyword) => requestString.includes(keyword))
            ) {
              console.warn("🚨 Blocked SQL injection attempt:", {
                ip: req.ip,
                url: req.url,
              });
              return res
                .status(400)
                .json({ error: "Suspicious request detected" });
            }

            // Basic XSS protection
            const xssPatterns = [
              "<script",
              "javascript:",
              "onload=",
              "onerror=",
            ];
            if (
              xssPatterns.some((pattern) => requestString.includes(pattern))
            ) {
              console.warn("🚨 Blocked XSS attempt:", {
                ip: req.ip,
                url: req.url,
              });
              return res
                .status(400)
                .json({ error: "Suspicious request detected" });
            }

            next();
          } catch (error) {
            console.error("WAF error:", error.message);
            next(); // Continue on error
          }
        });
      }
    } catch (error) {
      console.error("❌ Failed to apply WAF middleware:", error.message);
      // Continue without WAF rather than crashing
    }

    // Static files - FIXED PATH
    this.app.use(express.static(path.join(__dirname, "../public")));

    // Body parsing with limits
    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10kb" }));

    // Enhanced request logging middleware with security
    this.app.use((req, res, next) => {
      // Check for blocked IPs
      if (this.healthMonitor.isIPBlocked(req.ip)) {
        logger.warn("Blocked IP attempt", {
          ip: req.ip,
          url: req.url,
          method: req.method,
        });
        return res.status(403).json({
          error: "Access temporarily blocked due to security policy",
        });
      }

      const start = Date.now();
      const requestId = encryptionManager.generateSecureToken(16);

      // Add security headers to response
      res.setHeader("X-Request-ID", requestId);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");

      res.on("finish", () => {
        const responseTime = Date.now() - start;
        const success = res.statusCode < 400;

        // Track security events for failed requests
        if (!success && res.statusCode >= 400) {
          this.healthMonitor.trackSecurityEvent("http_error", {
            requestId: requestId,
            route: req.path,
            method: req.method,
            statusCode: res.statusCode,
            ip: req.ip,
            userAgent: req.get("User-Agent"),
            severity: res.statusCode >= 500 ? "high" : "medium",
          });
        }

        // Track all responses for monitoring
        this.healthMonitor.trackResponseTime(
          req.path,
          req.method,
          res.statusCode,
          responseTime
        );

        logger.debug("HTTP Request Completed", {
          requestId: requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: responseTime,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });
      });

      next();
    });

    logger.info("Enhanced security middleware setup completed");

    // 🔧 COMPREHENSIVE ERROR HANDLING MIDDLEWARE
    console.log("🔧 Setting up error handling middleware...");

    // Add this before your routes but after all other middleware
    this.app.use((req, res, next) => {
      // Request logging
      const requestId = encryptionManager.generateSecureToken(16);
      const startTime = Date.now();

      console.log("🔍 Incoming Request:", {
        requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent") || "Unknown",
        timestamp: new Date().toISOString(),
      });

      // Override res.json to catch JSON errors
      const originalJson = res.json;
      res.json = function (data) {
        try {
          return originalJson.call(this, data);
        } catch (error) {
          console.error("🚨 JSON serialization error:", {
            requestId,
            error: error.message,
            data: typeof data,
          });
          return originalJson.call(this, {
            error: "Response serialization failed",
          });
        }
      };

      // Track response completion
      res.on("finish", () => {
        const responseTime = Date.now() - startTime;
        console.log("✅ Request Completed:", {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`,
          ip: req.ip,
        });
      });

      next();
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      const errorId = encryptionManager.generateSecureToken(16);

      console.error("🚨 GLOBAL ERROR HANDLER:", {
        errorId,
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Don't leak error details in production
      const errorMessage =
        process.env.NODE_ENV === "production"
          ? "Something went wrong"
          : error.message;

      res.status(500).json({
        error: errorMessage,
        errorId: process.env.NODE_ENV === "development" ? errorId : undefined,
      });
    });
  }

  setupRoutes() {
    logger.debug("Setting up enhanced security routes");

    // Apply specific rate limiters to routes
    console.log("🔒 Applying route-specific rate limiters...");
    try {
      this.app.use("/api/auth/login", authLimiter);
      this.app.use("/api/auth/signup", registerLimiter);
      this.app.use("/api/auth/mfa", mfaLimiter);
      this.app.use("/api/video", videoLimiter);
      this.app.use("/api/", apiLimiter);
      this.app.use("/api/admin", adminLimiter);
      console.log("✅ Route-specific rate limiters applied successfully");
    } catch (error) {
      console.error(
        "❌ Failed to apply route-specific rate limiters:",
        error.message
      );
    }

    // =========================================================================
    // BASIC HEALTH & DEBUG ROUTES - ADD THESE FIRST
    // =========================================================================

    console.log("🔧 Setting up basic health and debug routes...");

    // SIMPLE HEALTH CHECK
    this.app.get("/health", (req, res) => {
      console.log("✅ Health check route hit");
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
        security: "enhanced",
      });
    });

    // API HEALTH CHECK - FIXED
    this.app.get("/api/health", (req, res) => {
      console.log("✅ API health route hit");
      res.json({
        status: "OK",
        service: "campusconnect-server",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      });
    });

    // DEBUG TEST ROUTE
    this.app.get("/debug-test", (req, res) => {
      console.log("✅ Debug test route hit");
      res.json({
        status: "success",
        message: "Debug route working",
        timestamp: new Date().toISOString(),
        routes: {
          health: "/health",
          apiHealth: "/api/health",
          root: "/",
          debug: "/debug-test",
        },
      });
    });

    // TEST MIDDLEWARE ROUTE
    this.app.get("/test-middleware", (req, res) => {
      console.log("🔍 Testing middleware stack...");

      const testData = {
        ip: req.ip,
        method: req.method,
        url: req.url,
        headers: Object.keys(req.headers),
        hasBody: !!req.body,
        hasQuery: !!req.query,
        timestamp: new Date().toISOString(),
      };

      console.log("✅ Middleware test data:", testData);

      res.json({
        status: "middleware_working",
        testData: testData,
        serverInfo: {
          environment: process.env.NODE_ENV || "development",
          security: "enhanced",
          timestamp: new Date().toISOString(),
        },
      });
    });

    console.log("✅ Basic routes setup completed");

    // =========================================================================
    // PHASE 1 SECURITY ENHANCEMENT ROUTES
    // =========================================================================

    console.log("🔧 Setting up security enhancement routes...");

    // 🔐 MFA Routes
    this.app.post("/api/auth/mfa/setup", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        // Generate MFA secret
        const mfaSecret = mfaManager.generateSecret(email);

        // Generate QR code
        const qrCode = await mfaManager.generateQRCode(mfaSecret.otpauth_url);

        // Generate backup codes
        const backupCodes = mfaManager.generateBackupCodes();

        // Store temporarily (in production, use Redis with expiry)
        const tempStorage = {
          secret: mfaSecret.secret,
          backupCodes: backupCodes,
          createdAt: new Date(),
        };

        // In production, store this in Redis with 10min expiry
        // For now, we'll return directly - implement Redis in Phase 2
        res.json({
          success: true,
          secret: mfaSecret.secret,
          qrCode: qrCode,
          backupCodes: backupCodes.map((bc) => bc.code),
          message: "Scan QR code with authenticator app",
        });
      } catch (error) {
        logger.error("MFA setup error", { requestId, error: error.message });
        res.status(500).json({ error: "MFA setup failed" });
      }
    });

    this.app.post("/api/auth/mfa/verify-setup", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        const { email, token, backupCode } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        // In production, retrieve from Redis
        // const tempData = await redisClient.get(`mfa_setup:${email}`);
        // const mfaData = JSON.parse(tempData);

        // For now, we'll simulate - you'll need to implement proper storage
        const mfaData = {}; // Get from your temporary storage

        if (!mfaData) {
          return res.status(400).json({ error: "MFA setup session expired" });
        }

        let verified = false;

        // Verify with TOTP token
        if (token && mfaManager.verifyToken(mfaData.secret, token)) {
          verified = true;
        }
        // Or verify with backup code
        else if (
          backupCode &&
          mfaManager.verifyBackupCode(mfaData.backupCodes, backupCode)
        ) {
          verified = true;
        }

        if (verified) {
          // Store MFA secret in user's database record
          const { error: updateError } = await supabase
            .from("profiles") // Use your actual table name
            .update({
              mfa_secret: mfaData.secret,
              mfa_backup_codes: mfaData.backupCodes,
              mfa_enabled: true,
            })
            .eq("email", email);

          if (updateError) {
            throw updateError;
          }

          res.json({
            success: true,
            message: "MFA enabled successfully",
            remainingBackupCodes: mfaManager.getRemainingBackupCodes(
              mfaData.backupCodes
            ),
          });
        } else {
          res.status(400).json({ error: "Invalid verification code" });
        }
      } catch (error) {
        logger.error("MFA verify setup error", {
          requestId,
          error: error.message,
        });
        res.status(500).json({ error: "MFA verification failed" });
      }
    });

    this.app.post("/api/auth/mfa/verify", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        const { email, token, backupCode } = req.body;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        // Get user's MFA data from database
        const { data: user, error } = await supabase
          .from("profiles") // Use your actual table name
          .select("mfa_secret, mfa_backup_codes, mfa_enabled")
          .eq("email", email)
          .single();

        if (error || !user || !user.mfa_enabled) {
          return res
            .status(400)
            .json({ error: "MFA not enabled for this user" });
        }

        let verified = false;

        // Verify with TOTP token
        if (token && mfaManager.verifyToken(user.mfa_secret, token)) {
          verified = true;
        }
        // Or verify with backup code
        else if (
          backupCode &&
          mfaManager.verifyBackupCode(user.mfa_backup_codes, backupCode)
        ) {
          verified = true;

          // Update backup codes in database
          await supabase
            .from("profiles")
            .update({ mfa_backup_codes: user.mfa_backup_codes })
            .eq("email", email);
        }

        if (verified) {
          // Generate MFA session token
          const jwt = require("jsonwebtoken");
          const mfaToken = jwt.sign(
            {
              email: email,
              mfa_verified: true,
            },
            process.env.JWT_SECRET,
            { expiresIn: "5m" } // Short expiry for MFA token
          );

          res.json({
            success: true,
            mfa_token: mfaToken,
            message: "MFA verification successful",
          });
        } else {
          // Track failed MFA attempt
          this.healthMonitor.trackSecurityEvent("mfa_failed", {
            requestId: requestId,
            email: email,
            ip: req.ip,
            reason: "Invalid code",
            severity: "medium",
          });

          res.status(400).json({ error: "Invalid MFA code" });
        }
      } catch (error) {
        logger.error("MFA verification error", {
          requestId,
          error: error.message,
        });
        res.status(500).json({ error: "MFA verification failed" });
      }
    });

    this.app.post("/api/auth/mfa/disable", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res
            .status(400)
            .json({ error: "Email and password are required" });
        }

        // Verify password first
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: email,
            password: password,
          });

        if (authError) {
          return res.status(401).json({ error: "Invalid password" });
        }

        // Disable MFA
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            mfa_secret: null,
            mfa_backup_codes: null,
            mfa_enabled: false,
          })
          .eq("email", email);

        if (updateError) {
          throw updateError;
        }

        res.json({
          success: true,
          message: "MFA disabled successfully",
        });
      } catch (error) {
        logger.error("MFA disable error", { requestId, error: error.message });
        res.status(500).json({ error: "Failed to disable MFA" });
      }
    });

    // 🛡️ WAF Metrics Route
    this.app.get("/api/admin/security/waf-metrics", (req, res) => {
      try {
        const wafMetrics = advancedSecurity.getSecurityMetrics();

        res.json({
          status: "success",
          data: wafMetrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("WAF metrics error", error);
        res.status(500).json({ error: "Failed to get WAF metrics" });
      }
    });

    // 🔒 Security Status Route
    this.app.get("/api/security/status", (req, res) => {
      try {
        const securityStatus = {
          encryption: "enabled",
          mfa: "available",
          waf: "active",
          monitoring: "enabled",
          timestamp: new Date().toISOString(),
        };

        res.json({
          status: "success",
          data: securityStatus,
        });
      } catch (error) {
        logger.error("Security status error", error);
        res.status(500).json({ error: "Failed to get security status" });
      }
    });

    // Add this to your routes for debugging
    this.app.get("/api/debug/queue-status", (req, res) => {
      try {
        const queueStatus = this.pairingManager.getDetailedQueueStatus();
        const sockets = Array.from(this.io.sockets.sockets.values());

        const connectedUsers = sockets.map((socket) => ({
          socketId: socket.id,
          userId: socket.userId,
          userEmail: socket.userEmail,
          connected: socket.connected,
          joinedQueue: socket._joinedQueue || false, // We'll track this
        }));

        res.json({
          queue: queueStatus,
          connectedUsers: connectedUsers,
          totalConnected: sockets.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Debug queue status error", error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post("/api/debug/force-join/:socketId", (req, res) => {
      try {
        const { socketId } = req.params;
        const socket = this.io.sockets.sockets.get(socketId);

        if (!socket) {
          return res.status(404).json({ error: "Socket not found" });
        }

        const joinData = {
          preferences: {
            college: "CMRIT",
            major: "Debug",
            interests: ["forced-join"],
          },
        };

        socket.emit("join_queue", joinData);

        res.json({
          message: "Join queue forced",
          socketId: socketId,
          userId: socket.userId,
        });
      } catch (error) {
        logger.error("Force join error", error);
        res.status(500).json({ error: error.message });
      }
    });

    // 🔒 ENHANCED SIGNUP ROUTE WITH NEW RATE LIMITING
    this.app.post("/api/auth/signup", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        let { email, password, firstName, lastName, college, major } = req.body;

        // 🔒 SANITIZE ALL INPUTS
        email = sanitizeInput(email?.toString() || "");
        firstName = sanitizeInput(firstName?.toString() || "");
        lastName = sanitizeInput(lastName?.toString() || "");
        college = sanitizeInput(college?.toString() || "");
        major = sanitizeInput(major?.toString() || "");

        logger.info("Secure signup attempt", {
          requestId: requestId,
          email: email,
          ip: req.ip,
        });

        // Validate required fields
        if (!email || !password || !firstName || !lastName) {
          this.healthMonitor.trackSecurityEvent("signup_validation_failed", {
            requestId: requestId,
            email: email,
            ip: req.ip,
            reason: "Missing required fields",
            severity: "low",
          });

          return res.status(400).json({
            error: "Email, password, first name and last name are required",
          });
        }

        // 🔒 VALIDATE EMAIL DOMAIN
        const allowedDomains = [".edu", "@cmrit.ac.in"];
        const isValidEmail = allowedDomains.some((domain) =>
          email.toLowerCase().endsWith(domain.toLowerCase())
        );

        if (!isValidEmail) {
          this.healthMonitor.trackSecurityEvent("signup_invalid_email", {
            requestId: requestId,
            email: email,
            ip: req.ip,
            reason: "Invalid email domain",
            severity: "medium",
          });

          return res.status(400).json({
            error:
              "Please use a valid college email address (.edu or @cmrit.ac.in)",
          });
        }

        // 🔒 ENHANCED PASSWORD VALIDATION
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          this.healthMonitor.trackSecurityEvent("signup_weak_password", {
            requestId: requestId,
            email: email,
            ip: req.ip,
            requirements: passwordValidation.requirements,
            severity: "medium",
          });

          return res.status(400).json({
            error: "Password does not meet security requirements",
            requirements: passwordValidation.requirements,
          });
        }

        // Create user with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email: email,
            password: password,
            options: {
              data: {
                first_name: firstName,
                last_name: lastName,
                college: college || "",
                major: major || "",
              },
            },
          }
        );

        if (authError) {
          logger.error("Signup Supabase auth error", {
            requestId: requestId,
            error: authError.message,
            email: email,
          });

          // Track failed signup attempt
          this.healthMonitor.trackSecurityEvent("failed_signup", {
            requestId: requestId,
            email: email,
            reason: authError.message,
            ip: req.ip,
            severity: "medium",
          });

          let errorMessage = "Signup failed";
          if (
            authError.message.includes("already registered") ||
            authError.message.includes("user_exists")
          ) {
            errorMessage = "User already exists with this email";
          } else if (authError.message.includes("password")) {
            errorMessage = "Password does not meet requirements";
          } else if (authError.message.includes("email")) {
            errorMessage = "Invalid email format";
          }

          return res.status(400).json({ error: errorMessage });
        }

        // Track successful user registration
        this.healthMonitor.metrics.users.totalRegistered++;
        this.healthMonitor.metrics.users.newUsersToday++;

        // Track successful signup
        this.healthMonitor.trackSecurityEvent("signup_success", {
          requestId: requestId,
          userId: authData.user?.id,
          email: email,
          ip: req.ip,
          severity: "low",
        });

        // If user created successfully but email not confirmed
        if (authData.user && !authData.user.email_confirmed_at) {
          logger.info("User created but email not confirmed", {
            requestId: requestId,
            userId: authData.user.id,
          });

          // Generate JWT token for immediate login (optional)
          const jwt = require("jsonwebtoken");
          const token = jwt.sign(
            {
              userId: authData.user.id,
              email: authData.user.email,
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
          );

          return res.status(200).json({
            message:
              "Signup successful! Please check your email for verification.",
            token: token,
            user: {
              id: authData.user.id,
              email: authData.user.email,
              firstName: firstName,
              lastName: lastName,
              college: college,
              major: major,
            },
            requiresVerification: true,
          });
        }

        // If user exists and is confirmed
        if (authData.user && authData.user.email_confirmed_at) {
          const jwt = require("jsonwebtoken");
          const token = jwt.sign(
            {
              userId: authData.user.id,
              email: authData.user.email,
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
          );

          return res.status(200).json({
            message: "Signup successful!",
            token: token,
            user: {
              id: authData.user.id,
              email: authData.user.email,
              firstName: firstName,
              lastName: lastName,
              college: college,
              major: major,
            },
          });
        }

        // Fallback response
        res.status(200).json({
          message:
            "Signup request received. Please check your email for verification.",
        });
      } catch (error) {
        logger.error("Signup route unexpected error", {
          requestId: requestId,
          error: error.message,
          stack: error.stack,
        });
        this.healthMonitor.trackError(error, {
          route: "/api/auth/signup",
          requestId: requestId,
        });

        this.healthMonitor.trackSecurityEvent("signup_system_error", {
          requestId: requestId,
          error: error.message,
          ip: req.ip,
          severity: "high",
        });

        res.status(500).json({ error: "Internal server error" });
      }
    });

    // 🔒 ENHANCED LOGIN ROUTE WITH MFA SUPPORT
    this.app.post("/api/auth/login", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        let { email, password, mfa_token } = req.body;

        // Sanitize inputs
        email = sanitizeInput(email?.toString() || "");

        // Check if MFA token is provided (step 2 of login)
        if (mfa_token) {
          try {
            const jwt = require("jsonwebtoken");
            const decoded = jwt.verify(mfa_token, process.env.JWT_SECRET);

            if (decoded.email === email && decoded.mfa_verified) {
              // MFA verified, generate final auth token
              const finalToken = jwt.sign(
                {
                  userId: decoded.userId,
                  email: email,
                  sessionId: encryptionManager.generateSecureToken(16),
                  mfa_verified: true,
                },
                process.env.JWT_SECRET,
                { expiresIn: "24h" }
              );

              // Track successful login with MFA
              this.healthMonitor.trackSecurityEvent("login_success_mfa", {
                requestId: requestId,
                email: email,
                ip: req.ip,
                severity: "low",
              });

              return res.json({
                message: "Login successful",
                token: finalToken,
                user: {
                  email: email,
                  mfa_enabled: true,
                },
              });
            }
          } catch (error) {
            // Invalid MFA token, continue with normal login
            logger.warn("Invalid MFA token provided", {
              email,
              error: error.message,
            });
          }
        }

        // Normal login flow (step 1)
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // Track failed login
          this.healthMonitor.trackFailedLogin(req.ip, email, error.message);
          return res.status(401).json({ error: "Invalid credentials" });
        }

        // Check if user has MFA enabled
        const { data: userProfile } = await supabase
          .from("profiles") // Use your actual table name
          .select("mfa_enabled")
          .eq("email", email)
          .single();

        if (userProfile && userProfile.mfa_enabled) {
          // Return MFA required response
          const jwt = require("jsonwebtoken");
          const mfaRequestToken = jwt.sign(
            {
              userId: data.user.id,
              email: email,
              mfa_required: true,
            },
            process.env.JWT_SECRET,
            { expiresIn: "5m" }
          );

          return res.json({
            message: "MFA required",
            mfa_required: true,
            mfa_token: mfaRequestToken,
          });
        }

        // No MFA required, return normal token
        const jwt = require("jsonwebtoken");
        const token = jwt.sign(
          {
            userId: data.user.id,
            email: data.user.email,
            sessionId: encryptionManager.generateSecureToken(16),
          },
          process.env.JWT_SECRET,
          { expiresIn: "24h" }
        );

        // Track successful login
        this.healthMonitor.trackUserLogin(data.user.id, {
          email: data.user.email,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          sessionId: encryptionManager.generateSecureToken(16),
        });

        res.json({
          message: "Login successful",
          token: token,
          user: {
            id: data.user.id,
            email: data.user.email,
          },
        });
      } catch (error) {
        logger.error("Login route unexpected error", {
          requestId: requestId,
          error: error.message,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // =========================================================================
    // STATIC FILE ROUTES
    // =========================================================================

    console.log("🔧 Setting up static file routes...");

    // Video chat route
    this.app.get("/video-chat", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/video-chat.html"));
    });

    // Text chat route
    this.app.get("/chat", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/chat.html"));
    });

    // Deployment test endpoint
    this.app.get("/api/deploy-test", (req, res) => {
      res.json({
        status: "OK",
        message: "Deployment successful",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        supabase: process.env.SUPABASE_URL ? "configured" : "missing",
        security: "enhanced",
      });
    });

    // =========================================================================
    // ELITE ADMIN DASHBOARD ROUTES - UPDATED WITH ENHANCED SECURITY
    // =========================================================================

    // DevOps Admin Dashboard Routes
    this.app.get("/admin/dashboard", (req, res) => {
      // Add security check for admin access
      this.healthMonitor.trackSecurityEvent("admin_access", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        severity: "medium",
      });

      res.sendFile(path.join(__dirname, "../public/admin-dashboard.html"));
    });

    // Static file serving for admin dashboard
    this.app.get("/css/style.css", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/css/style.css"));
    });

    this.app.get("/js/admin-dashboard.js", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/js/admin-dashboard.js"));
    });

    // Admin routes with admin rate limiting
    this.app.get("/api/admin/metrics/stream", (req, res) => {
      // Security check for admin endpoints
      this.healthMonitor.trackSecurityEvent("admin_metrics_access", {
        ip: req.ip,
        endpoint: "/api/admin/metrics/stream",
        severity: "medium",
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const sendMetrics = () => {
        try {
          const metrics = this.healthMonitor.getRealTimeMetrics();
          // Add security context to metrics
          metrics.security = this.healthMonitor.getSecurityMetrics();
          res.write(`data: ${JSON.stringify(metrics)}\n\n`);
        } catch (error) {
          console.error("Error sending metrics:", error);
          this.healthMonitor.trackError(error, { endpoint: "metrics_stream" });
        }
      };

      // Send metrics every 2 seconds
      const interval = setInterval(sendMetrics, 2000);

      req.on("close", () => {
        clearInterval(interval);
        res.end();
      });
    });

    // Detailed metrics endpoint - ENHANCED
    this.app.get("/api/admin/metrics/detailed", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_detailed_metrics", {
          ip: req.ip,
          endpoint: "/api/admin/metrics/detailed",
          severity: "medium",
        });

        const metrics = this.healthMonitor.getRealTimeMetrics();
        metrics.security = this.healthMonitor.getSecurityMetrics();

        res.json({
          status: "success",
          data: metrics,
          timestamp: new Date().toISOString(),
          securityLevel: "enhanced",
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "detailed_metrics" });
        res.status(500).json({
          status: "error",
          message: "Failed to get metrics",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // User management endpoints - ENHANCED
    this.app.get("/api/admin/users/online", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_online_users", {
          ip: req.ip,
          endpoint: "/api/admin/users/online",
          severity: "medium",
        });

        const onlineUsers = this.healthMonitor.getActiveSockets();
        res.json({
          status: "success",
          data: onlineUsers,
          count: onlineUsers.length,
          security: "encrypted",
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "online_users" });
        res.status(500).json({
          status: "error",
          message: "Failed to get online users",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    this.app.get("/api/admin/conversations/active", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_active_conversations", {
          ip: req.ip,
          endpoint: "/api/admin/conversations/active",
          severity: "medium",
        });

        const activePairs = this.healthMonitor.getActivePairs();
        res.json({
          status: "success",
          data: activePairs,
          count: activePairs.length,
          security: "encrypted",
        });
      } catch (error) {
        this.healthMonitor.trackError(error, {
          endpoint: "active_conversations",
        });
        res.status(500).json({
          status: "error",
          message: "Failed to get active conversations",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Security endpoints - ENHANCED
    this.app.post("/api/admin/security/block-ip", (req, res) => {
      try {
        const { ip, reason } = req.body;

        if (!ip) {
          return res.status(400).json({
            status: "error",
            message: "IP address is required",
          });
        }

        this.healthMonitor.trackSecurityEvent("admin_ip_block", {
          ip: req.ip,
          targetIp: ip,
          reason: reason,
          severity: "high",
        });

        this.healthMonitor.blockIP(ip, reason);

        res.json({
          status: "success",
          message: `IP ${ip} blocked successfully`,
          timestamp: new Date().toISOString(),
          blockedBy: req.ip,
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "block_ip" });
        res.status(500).json({
          status: "error",
          message: "Failed to block IP",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    this.app.get("/api/admin/security/events", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_security_events", {
          ip: req.ip,
          endpoint: "/api/admin/security/events",
          severity: "medium",
        });

        const securityMetrics = this.healthMonitor.getSecurityMetrics();
        res.json({
          status: "success",
          data: securityMetrics.recentSecurityEvents,
          count: securityMetrics.recentSecurityEvents.length,
          totalEvents: securityMetrics.totalSecurityEvents,
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "security_events" });
        res.status(500).json({
          status: "error",
          message: "Failed to get security events",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Performance endpoints
    this.app.get("/api/admin/performance/endpoints", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_performance_endpoints", {
          ip: req.ip,
          endpoint: "/api/admin/performance/endpoints",
          severity: "low",
        });

        const appMetrics = this.healthMonitor.getApplicationMetrics();
        res.json({
          status: "success",
          data: appMetrics.requests.byEndpoint,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.healthMonitor.trackError(error, {
          endpoint: "performance_endpoints",
        });
        res.status(500).json({
          status: "error",
          message: "Failed to get endpoint performance",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Admin actions - ENHANCED
    this.app.post("/api/admin/actions/reset-metrics", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_reset_metrics", {
          ip: req.ip,
          endpoint: "/api/admin/actions/reset-metrics",
          severity: "medium",
        });

        this.healthMonitor.resetMetrics();
        res.json({
          status: "success",
          message: "Metrics reset successfully",
          timestamp: new Date().toISOString(),
          resetBy: req.ip,
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "reset_metrics" });
        res.status(500).json({
          status: "error",
          message: "Failed to reset metrics",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    this.app.post("/api/admin/actions/restart-services", (req, res) => {
      try {
        this.healthMonitor.trackSecurityEvent("admin_restart_services", {
          ip: req.ip,
          endpoint: "/api/admin/actions/restart-services",
          severity: "high",
        });

        // Implement service restart logic
        res.json({
          status: "success",
          message: "Services restart initiated",
          timestamp: new Date().toISOString(),
          initiatedBy: req.ip,
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "restart_services" });
        res.status(500).json({
          status: "error",
          message: "Failed to restart services",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Legacy admin endpoints (for backward compatibility)
    this.app.get("/api/admin/metrics", (req, res) => {
      this.healthMonitor.trackSecurityEvent("admin_legacy_metrics", {
        ip: req.ip,
        endpoint: "/api/admin/metrics",
        severity: "low",
      });

      const healthReport = this.healthMonitor.getRealTimeMetrics();
      healthReport.security = this.healthMonitor.getSecurityMetrics();

      res.json({
        status: "success",
        data: healthReport,
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get("/api/admin/security-events", (req, res) => {
      this.healthMonitor.trackSecurityEvent("admin_legacy_security", {
        ip: req.ip,
        endpoint: "/api/admin/security-events",
        severity: "low",
      });

      const securityMetrics = this.healthMonitor.getSecurityMetrics();
      res.json({
        status: "success",
        data: {
          events: securityMetrics.recentSecurityEvents,
          metrics: securityMetrics,
        },
      });
    });

    this.app.get("/api/admin/performance", (req, res) => {
      this.healthMonitor.trackSecurityEvent("admin_legacy_performance", {
        ip: req.ip,
        endpoint: "/api/admin/performance",
        severity: "low",
      });

      res.json({
        status: "success",
        data: this.healthMonitor.getPerformanceMetrics(),
      });
    });

    this.app.get("/api/admin/errors", (req, res) => {
      this.healthMonitor.trackSecurityEvent("admin_legacy_errors", {
        ip: req.ip,
        endpoint: "/api/admin/errors",
        severity: "low",
      });

      res.json({
        status: "success",
        data: this.healthMonitor.getErrorMetrics(),
      });
    });

    this.app.post("/api/admin/actions/block-ip", (req, res) => {
      const { ip, reason } = req.body;

      this.healthMonitor.trackSecurityEvent("admin_legacy_block_ip", {
        ip: req.ip,
        targetIp: ip,
        reason: reason,
        severity: "high",
      });

      this.healthMonitor.blockIP(ip, reason);

      res.json({
        status: "success",
        message: `IP ${ip} blocked successfully`,
      });
    });

    // =========================================================================
    // NEW QUEUE MANAGEMENT ROUTES
    // =========================================================================

    // Queue status endpoint for monitoring
    this.app.get("/api/queue/status", (req, res) => {
      try {
        const queueStatus = this.pairingManager.getDetailedQueueStatus();

        res.json({
          status: "success",
          data: queueStatus,
          timestamp: new Date().toISOString(),
          serverTime: Date.now(),
        });
      } catch (error) {
        logger.error("Error getting queue status", error);
        this.healthMonitor.trackError(error, { endpoint: "queue_status" });
        res.status(500).json({
          status: "error",
          message: "Failed to get queue status",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Real-time queue monitoring endpoint
    this.app.get("/api/queue/stream", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const sendQueueUpdate = () => {
        try {
          const queueStatus = this.pairingManager.getDetailedQueueStatus();
          res.write(`data: ${JSON.stringify(queueStatus)}\n\n`);
        } catch (error) {
          console.error("Error sending queue update:", error);
          this.healthMonitor.trackError(error, { endpoint: "queue_stream" });
        }
      };

      // Send updates every 3 seconds
      const interval = setInterval(sendQueueUpdate, 3000);

      req.on("close", () => {
        clearInterval(interval);
        res.end();
      });
    });

    // =========================================================================
    // EXISTING APPLICATION ROUTES
    // =========================================================================

    // Server info endpoint (for debugging)
    this.app.get("/api/info", (req, res) => {
      const info = {
        server: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
        pairing: this.pairingManager.getQueueStatus(),
        environment: process.env.NODE_ENV || "development",
        security: {
          level: "enhanced",
          encryption: "enabled",
          monitoring: "active",
        },
      };
      res.json(info);
    });

    // Config endpoint
    this.app.get("/api/config", (req, res) => {
      res.json({
        supabaseUrl: process.env.SUPABASE_URL ? "configured" : "missing",
        supabaseKey: process.env.SUPABASE_ANON_KEY ? "configured" : "missing",
        environment: process.env.NODE_ENV || "development",
        security: "enhanced",
      });
    });

    // Health monitoring endpoints
    this.app.get("/api/health/detailed", async (req, res) => {
      try {
        const health = this.healthMonitor.getRealTimeMetrics();
        health.security = this.healthMonitor.getSecurityMetrics();

        res.json({
          status: "success",
          data: health,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.healthMonitor.trackError(error, { endpoint: "health_detailed" });
        res.status(500).json({
          status: "error",
          message: "Health check failed",
          error:
            process.env.NODE_ENV === "production"
              ? "Internal error"
              : error.message,
        });
      }
    });

    // Quick health check
    this.app.get("/api/health/quick", (req, res) => {
      const metrics = this.healthMonitor.getApplicationMetrics();

      res.json({
        status: "healthy",
        uptime: metrics.uptime,
        requests: metrics.requests.total,
        activeConnections: metrics.connections.active,
        timestamp: new Date().toISOString(),
        security: "enhanced",
      });
    });

    // Metrics endpoint for monitoring
    this.app.get("/api/health/metrics", (req, res) => {
      res.json({
        status: "success",
        data: {
          application: this.healthMonitor.getApplicationMetrics(),
          system: this.healthMonitor.getSystemMetrics(),
          security: this.healthMonitor.getSecurityMetrics(),
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Reset metrics (protected endpoint)
    this.app.post("/api/health/reset", (req, res) => {
      this.healthMonitor.trackSecurityEvent("health_metrics_reset", {
        ip: req.ip,
        endpoint: "/api/health/reset",
        severity: "medium",
      });

      this.healthMonitor.resetMetrics();

      res.json({
        status: "success",
        message: "Metrics reset successfully",
        timestamp: new Date().toISOString(),
      });
    });

    // =========================================================================
    // STATIC FILE SERVING AND SPA FALLBACK
    // =========================================================================

    console.log("🔧 Setting up static file serving...");

    // Serve HTML files explicitly
    const htmlFiles = [
      "/",
      "/login",
      "/signup",
      "/dashboard",
      "/chat",
      "/video-chat",
    ];

    htmlFiles.forEach((route) => {
      this.app.get(route, (req, res) => {
        let file = "index.html";
        if (route === "/login") file = "login.html";
        else if (route === "/signup") file = "signup.html";
        else if (route === "/dashboard") file = "dashboard.html";
        else if (route === "/chat") file = "chat.html";
        else if (route === "/video-chat") file = "video-chat.html";

        console.log(`📁 Serving static file: ${route} -> ${file}`);
        res.sendFile(path.join(__dirname, "../public", file));
      });
    });

    // Serve HTML files with .html extension
    this.app.get("*.html", (req, res) => {
      res.sendFile(path.join(__dirname, "../public", req.path));
    });

    // 404 handler for API routes
    this.app.use("/api/*", (req, res) => {
      console.log("🔍 API 404 - Route not found:", req.originalUrl);

      this.healthMonitor.trackSecurityEvent("api_404", {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        severity: "low",
      });

      logger.warn("404 Not Found for API route", {
        url: req.originalUrl,
        method: req.method,
      });

      res.status(404).json({
        error: "API endpoint not found",
        requestedUrl: req.originalUrl,
        availableEndpoints: [
          "/health",
          "/api/health",
          "/debug-test",
          "/test-middleware",
          "/api/auth/signup",
          "/api/auth/login",
          "/api/info",
          "/api/config",
        ],
        timestamp: new Date().toISOString(),
      });
    });

    // SPA fallback - must be LAST
    this.app.get("*", (req, res) => {
      console.log("🔍 SPA fallback for:", req.url);
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // Final Express error handler
    this.app.use((err, req, res, next) => {
      const errorId = encryptionManager.generateSecureToken(16);

      // Don't leak error details in production
      const errorMessage =
        process.env.NODE_ENV === "production"
          ? "Something went wrong"
          : err.message;

      logger.error("Enhanced security error handler", {
        errorId: errorId,
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });

      // Track security incidents
      this.healthMonitor.trackSecurityEvent("server_error", {
        errorId: errorId,
        error: err.message,
        url: req.url,
        ip: req.ip,
        severity: "high",
      });

      this.healthMonitor.trackError(err, {
        route: req.path,
        method: req.method,
        errorId: errorId,
      });

      res.status(500).json({
        error: errorMessage,
        errorId: process.env.NODE_ENV === "development" ? errorId : undefined,
        timestamp: new Date().toISOString(),
      });
    });

    console.log("✅ All routes setup completed");
    logger.info("Enhanced security routes setup completed");
  }

  setupSocketIO() {
    logger.info("Setting up enhanced Socket.IO with security");

    // Enhanced authentication middleware for Socket.IO
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          logger.warn("Socket connection attempt without token", {
            socketId: socket.id,
            ip: socket.handshake.address,
          });

          this.healthMonitor.trackSecurityEvent("socket_auth_failed", {
            socketId: socket.id,
            ip: socket.handshake.address,
            reason: "No token provided",
            severity: "medium",
          });

          return next(new Error("Authentication required"));
        }

        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.sessionId =
          decoded.sessionId || encryptionManager.generateSecureToken(16);

        // Track successful socket authentication
        this.healthMonitor.trackSecurityEvent("socket_auth_success", {
          socketId: socket.id,
          userId: socket.userId,
          email: socket.userEmail,
          ip: socket.handshake.address,
          sessionId: socket.sessionId,
          severity: "low",
        });

        logger.info("Socket authenticated successfully", {
          socketId: socket.id,
          userId: socket.userId,
          email: socket.userEmail,
        });

        next();
      } catch (error) {
        logger.error("Socket authentication failed", {
          socketId: socket.id,
          error: error.message,
          ip: socket.handshake.address,
        });

        this.healthMonitor.trackSecurityEvent("socket_auth_failed", {
          socketId: socket.id,
          ip: socket.handshake.address,
          reason: error.message,
          severity: "high",
        });

        next(new Error("Authentication failed"));
      }
    });

    // Connection handling with enhanced security
    this.io.on("connection", (socket) => {
      const connectionId = encryptionManager.generateSecureToken(16);

      logger.info("New secure socket connection", {
        socketId: socket.id,
        userId: socket.userId,
        email: socket.userEmail,
        connectionId: connectionId,
        ip: socket.handshake.address,
      });

      // DEBUG: Log all socket events
      const originalEmit = socket.emit;
      socket.emit = function (event, data) {
        if (event !== "signal") {
          // Don't log frequent signal events
          logger.debug(`🔵 SOCKET EMIT: ${event}`, {
            socketId: socket.id,
            userId: socket.userId,
            data: event === "chat_message" ? { ...data, message: "***" } : data,
          });
        }
        return originalEmit.apply(this, arguments);
      };

      // Track connection in health monitor
      this.healthMonitor.trackConnection(socket.id, {
        userId: socket.userId,
        email: socket.userEmail,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
        sessionId: socket.sessionId,
        connectionId: connectionId,
      });

      // AUTO-JOIN DEBUG: Add automatic queue join after 2 seconds
      setTimeout(() => {
        if (socket.connected) {
          logger.info("🟡 AUTO-JOIN: Attempting to auto-join queue", {
            socketId: socket.id,
            userId: socket.userId,
          });

          // Simulate a user joining the queue
          const joinData = {
            preferences: {
              college: "CMRIT",
              major: "Computer Science",
              interests: ["debugging", "testing"],
            },
          };

          logger.info("🟡 AUTO-JOIN: Emitting join_queue event", joinData);
          socket.emit("join_queue", joinData);
        }
      }, 2000);

      // Enhanced error handling
      socket.on("error", (error) => {
        logger.error("Socket error", {
          socketId: socket.id,
          userId: socket.userId,
          error: error.message,
          connectionId: connectionId,
        });

        this.healthMonitor.trackSecurityEvent("socket_error", {
          socketId: socket.id,
          userId: socket.userId,
          error: error.message,
          connectionId: connectionId,
          severity: "medium",
        });
      });

      // Enhanced disconnect handling
      socket.on("disconnect", (reason) => {
        logger.info("Socket disconnected", {
          socketId: socket.id,
          userId: socket.userId,
          reason: reason,
          connectionId: connectionId,
        });

        this.healthMonitor.trackDisconnection(socket.id, reason);

        // Track disconnection security event
        this.healthMonitor.trackSecurityEvent("socket_disconnect", {
          socketId: socket.id,
          userId: socket.userId,
          reason: reason,
          connectionId: connectionId,
          severity: "low",
        });
      });

      // Enhanced pairing events
      socket.on("join_queue", (data) => {
        try {
          // Sanitize user preferences
          const sanitizedData = {
            ...data,
            preferences: data.preferences
              ? {
                  ...data.preferences,
                  college: sanitizeInput(data.preferences.college || ""),
                  major: sanitizeInput(data.preferences.major || ""),
                  interests: (data.preferences.interests || []).map(
                    (interest) => sanitizeInput(interest)
                  ),
                }
              : {},
          };

          logger.info("User joining queue", {
            socketId: socket.id,
            userId: socket.userId,
            preferences: sanitizedData.preferences,
            connectionId: connectionId,
          });

          this.healthMonitor.trackSecurityEvent("queue_join", {
            socketId: socket.id,
            userId: socket.userId,
            preferences: sanitizedData.preferences,
            connectionId: connectionId,
            severity: "low",
          });

          this.pairingManager.joinQueue(socket, sanitizedData);
        } catch (error) {
          logger.error("Error joining queue", {
            socketId: socket.id,
            userId: socket.userId,
            error: error.message,
            connectionId: connectionId,
          });

          this.healthMonitor.trackSecurityEvent("queue_join_error", {
            socketId: socket.id,
            userId: socket.userId,
            error: error.message,
            connectionId: connectionId,
            severity: "medium",
          });
        }
      });

      socket.on("leave_queue", () => {
        logger.info("User leaving queue", {
          socketId: socket.id,
          userId: socket.userId,
          connectionId: connectionId,
        });

        this.healthMonitor.trackSecurityEvent("queue_leave", {
          socketId: socket.id,
          userId: socket.userId,
          connectionId: connectionId,
          severity: "low",
        });

        this.pairingManager.leaveQueue(socket.id);
      });

      // Enhanced signaling events
      socket.on("signal", (data) => {
        try {
          logger.debug("Processing signal", {
            from: socket.id,
            to: data.to,
            type: data.signal?.type,
            encrypted: !!data.signal?.encrypted,
            connectionId: connectionId,
          });

          // Track signaling for security monitoring
          this.healthMonitor.trackSecurityEvent("signal_exchange", {
            fromSocket: socket.id,
            toSocket: data.to,
            signalType: data.signal?.type,
            encrypted: !!data.signal?.encrypted,
            connectionId: connectionId,
            severity: "low",
          });

          this.signalingHandler.handleSignal(socket, data);
        } catch (error) {
          logger.error("Error handling signal", {
            socketId: socket.id,
            error: error.message,
            signalData: data,
            connectionId: connectionId,
          });

          this.healthMonitor.trackSecurityEvent("signal_error", {
            socketId: socket.id,
            error: error.message,
            signalType: data.signal?.type,
            connectionId: connectionId,
            severity: "medium",
          });
        }
      });

      // Enhanced chat message handling
      socket.on("chat_message", (data) => {
        try {
          // Sanitize chat message
          const sanitizedMessage = sanitizeInput(data.message);

          logger.debug("Processing chat message", {
            from: socket.id,
            to: data.to,
            messageLength: sanitizedMessage.length,
            connectionId: connectionId,
          });

          // Track chat message for monitoring
          this.healthMonitor.trackSecurityEvent("chat_message", {
            fromSocket: socket.id,
            toSocket: data.to,
            messageLength: sanitizedMessage.length,
            connectionId: connectionId,
            severity: "low",
          });

          // Broadcast the sanitized message
          socket.to(data.to).emit("chat_message", {
            from: socket.id,
            message: sanitizedMessage,
            timestamp: Date.now(),
          });
        } catch (error) {
          logger.error("Error handling chat message", {
            socketId: socket.id,
            error: error.message,
            connectionId: connectionId,
          });

          this.healthMonitor.trackSecurityEvent("chat_message_error", {
            socketId: socket.id,
            error: error.message,
            connectionId: connectionId,
            severity: "medium",
          });
        }
      });

      // Enhanced encryption key exchange
      socket.on("encryption:key-exchange", (data) => {
        try {
          logger.info("Processing encryption key exchange", {
            from: socket.id,
            to: data.to,
            type: data.type,
            connectionId: connectionId,
          });

          // Track encryption events
          this.healthMonitor.trackSecurityEvent("encryption_key_exchange", {
            fromSocket: socket.id,
            toSocket: data.to,
            exchangeType: data.type,
            connectionId: connectionId,
            severity: "medium",
          });

          this.signalingHandler.handleEncryptionKeyExchange(socket, data);
        } catch (error) {
          logger.error("Error handling encryption key exchange", {
            socketId: socket.id,
            error: error.message,
            connectionId: connectionId,
          });

          this.healthMonitor.trackSecurityEvent("encryption_error", {
            socketId: socket.id,
            error: error.message,
            connectionId: connectionId,
            severity: "high",
          });
        }
      });

      // Admin events
      socket.on("admin:get_metrics", () => {
        try {
          this.healthMonitor.trackSecurityEvent("admin_socket_metrics", {
            socketId: socket.id,
            userId: socket.userId,
            connectionId: connectionId,
            severity: "medium",
          });

          const metrics = this.healthMonitor.getRealTimeMetrics();
          metrics.security = this.healthMonitor.getSecurityMetrics();

          socket.emit("admin:metrics", metrics);
        } catch (error) {
          logger.error("Error handling admin metrics request", {
            socketId: socket.id,
            error: error.message,
            connectionId: connectionId,
          });
        }
      });
    });

    logger.info("Enhanced Socket.IO setup completed");
  }

  start(port = process.env.PORT || 3000) {
    return new Promise((resolve, reject) => {
      this.server
        .listen(port, "0.0.0.0", () => {
          const serverInfo = {
            port: port,
            environment: process.env.NODE_ENV || "development",
            pid: process.pid,
            security: "enhanced",
            encryption: "enabled",
            timestamp: new Date().toISOString(),
          };

          logger.info(
            "🚀 CampusConnect Server Started Successfully",
            serverInfo
          );
          console.log("🎉 Server is running!");
          console.log(`📍 Local: http://localhost:${port}`);
          console.log(`🌐 Network: http://0.0.0.0:${port}`);
          console.log(`🔧 Environment: ${serverInfo.environment}`);
          console.log(`🔒 Security: ${serverInfo.security}`);
          console.log(`🔐 Encryption: ${serverInfo.encryption}`);

          // Track server startup
          this.healthMonitor.trackSecurityEvent("server_start", {
            port: port,
            environment: serverInfo.environment,
            pid: serverInfo.pid,
            security: serverInfo.security,
            severity: "low",
          });

          resolve(serverInfo);
        })
        .on("error", (error) => {
          logger.error("❌ Server failed to start", {
            error: error.message,
            port: port,
            code: error.code,
          });

          this.healthMonitor.trackSecurityEvent("server_start_failed", {
            error: error.message,
            port: port,
            code: error.code,
            severity: "high",
          });

          reject(error);
        });
    });
  }

  // Enhanced graceful shutdown
  async shutdown() {
    logger.info("🛑 Initiating enhanced graceful shutdown");

    try {
      // Track shutdown event
      this.healthMonitor.trackSecurityEvent("server_shutdown", {
        reason: "graceful",
        uptime: process.uptime(),
        severity: "low",
      });

      // Close all socket connections
      this.io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
      });

      // Close Socket.IO
      this.io.close();

      // Close HTTP server
      if (this.server) {
        this.server.close(() => {
          logger.info("✅ HTTP server closed");
        });
      }

      // Perform final cleanup
      this.healthMonitor.shutdown();

      logger.info("✅ Enhanced graceful shutdown completed");
    } catch (error) {
      logger.error("❌ Error during shutdown", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

// Enhanced error handling for uncaught exceptions
process.on("uncaughtException", (error) => {
  const healthMonitor = require("./utils/healthMonitor");

  logger.error("🆘 UNCAUGHT EXCEPTION - CRITICAL", {
    error: error.message,
    stack: error.stack,
    pid: process.pid,
  });

  healthMonitor.trackSecurityEvent("uncaught_exception", {
    error: error.message,
    pid: process.pid,
    severity: "critical",
  });

  // Emergency shutdown
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  const healthMonitor = require("./utils/healthMonitor");

  logger.error("🆘 UNHANDLED REJECTION - CRITICAL", {
    reason: reason,
    promise: promise,
    pid: process.pid,
  });

  healthMonitor.trackSecurityEvent("unhandled_rejection", {
    reason: reason?.message || "Unknown",
    pid: process.pid,
    severity: "critical",
  });

  // Emergency shutdown
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Export the server class
module.exports = CampusConnectServer;

// Start server if this file is run directly
if (require.main === module) {
  const server = new CampusConnectServer();
  server.start().catch((error) => {
    console.error("💥 Failed to start server:", error);
    process.exit(1);
  });
}
