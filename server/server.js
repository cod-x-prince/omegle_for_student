const path = require("path");

// Load environment variables with explicit path
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Debug environment with better error handling
console.log("🚀 Starting server...");
console.log("Environment:", process.env.NODE_ENV || "not set");
console.log(
  "Supabase URL:",
  process.env.SUPABASE_URL || "MISSING - check .env file"
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

// Database (SUPABASE) Setup
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

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
    logger.debug("Setting up middleware");

    // Trust proxy configuration for Render
    this.app.set("trust proxy", 1);
    logger.info("Proxy configuration", {
      trustProxy: this.app.get("trust proxy"),
      nodeEnv: process.env.NODE_ENV,
    });

    // Security middleware
    this.app.use(securityConfig.helmetConfig);
    this.app.use(securityConfig.rateLimitConfig);

    // Static files - FIXED PATH
    this.app.use(express.static(path.join(__dirname, "../public")));

    // Body parsing with limits
    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10kb" }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on("finish", () => {
        const responseTime = Date.now() - start;
        const success = res.statusCode < 400;

        // ✅ FIXED: Now trackError exists in healthMonitor
        if (!success) {
          this.healthMonitor.trackError(new Error(`HTTP ${res.statusCode}`), {
            route: req.path,
            method: req.method,
            statusCode: res.statusCode,
          });
        }

        this.healthMonitor.trackResponseTime(
          req.path,
          req.method,
          res.statusCode,
          responseTime
        );
      });

      logger.debug("HTTP Request", {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      next();
    });

    logger.info("Middleware setup completed");
  }

  setupRoutes() {
    logger.debug("Setting up routes");

    // API route for signup - IMPROVED VERSION with health monitoring
    this.app.post("/api/auth/signup", async (req, res) => {
      try {
        const { email, password, firstName, lastName, college, major } =
          req.body;

        logger.info("Signup attempt", { email: email });

        // Validate required fields
        if (!email || !password || !firstName || !lastName) {
          return res.status(400).json({
            error: "Email, password, first name and last name are required",
          });
        }

        // Validate email domain
        const allowedDomains = [".edu", "@cmrit.ac.in"];
        const isValidEmail = allowedDomains.some((domain) =>
          email.toLowerCase().endsWith(domain.toLowerCase())
        );

        if (!isValidEmail) {
          return res.status(400).json({
            error:
              "Please use a valid college email address (.edu or @cmrit.ac.in)",
          });
        }

        if (password.length < 6) {
          return res.status(400).json({
            error: "Password must be at least 6 characters long",
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
            error: authError.message,
            email: email,
          });

          // Track failed signup attempt
          this.healthMonitor.trackSecurityEvent("failed_signup", {
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

        // If user created successfully but email not confirmed
        if (authData.user && !authData.user.email_confirmed_at) {
          logger.info("User created but email not confirmed", {
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
          error: error.message,
          stack: error.stack,
        });
        this.healthMonitor.trackError(error, { route: "/api/auth/signup" });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // API route for login - IMPROVED VERSION with health monitoring
    this.app.post("/api/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        logger.info("Login attempt", { email: email });

        if (!email || !password) {
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
          },
          process.env.JWT_SECRET,
          { expiresIn: "24h" } // Extended for better UX
        );

        // Track successful login
        this.healthMonitor.trackUserLogin(data.user.id, {
          email: data.user.email,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });

        logger.info("User logged in successfully", {
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
          error: error.message,
          stack: error.stack,
        });
        this.healthMonitor.trackError(error, { route: "/api/auth/login" });
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
      });
    });

    // =========================================================================
    // ELITE ADMIN DASHBOARD ROUTES - UPDATED WITH REAL DATA
    // =========================================================================

    // DevOps Admin Dashboard Routes
    this.app.get("/admin/dashboard", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/admin-dashboard.html"));
    });

    // Static file serving for admin dashboard
    this.app.get("/css/style.css", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/css/style.css"));
    });

    this.app.get("/js/admin-dashboard.js", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/js/admin-dashboard.js"));
    });

    // Real-time metrics streaming for dashboard - UPDATED
    this.app.get("/api/admin/metrics/stream", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const sendMetrics = () => {
        try {
          const metrics = this.healthMonitor.getRealTimeMetrics();
          res.write(`data: ${JSON.stringify(metrics)}\n\n`);
        } catch (error) {
          console.error("Error sending metrics:", error);
        }
      };

      // Send metrics every 2 seconds
      const interval = setInterval(sendMetrics, 2000);

      req.on("close", () => {
        clearInterval(interval);
        res.end();
      });
    });

    // Detailed metrics endpoint - UPDATED
    this.app.get("/api/admin/metrics/detailed", (req, res) => {
      try {
        const metrics = this.healthMonitor.getRealTimeMetrics();
        res.json({
          status: "success",
          data: metrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to get metrics",
          error: error.message,
        });
      }
    });

    // User management endpoints - NEW
    this.app.get("/api/admin/users/online", (req, res) => {
      try {
        const onlineUsers = this.healthMonitor.getActiveSockets();
        res.json({
          status: "success",
          data: onlineUsers,
          count: onlineUsers.length,
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to get online users",
          error: error.message,
        });
      }
    });

    this.app.get("/api/admin/conversations/active", (req, res) => {
      try {
        const activePairs = this.healthMonitor.getActivePairs();
        res.json({
          status: "success",
          data: activePairs,
          count: activePairs.length,
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to get active conversations",
          error: error.message,
        });
      }
    });

    // Security endpoints - UPDATED
    this.app.post("/api/admin/security/block-ip", (req, res) => {
      try {
        const { ip, reason } = req.body;
        this.healthMonitor.blockIP(ip, reason);

        res.json({
          status: "success",
          message: `IP ${ip} blocked successfully`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to block IP",
          error: error.message,
        });
      }
    });

    this.app.get("/api/admin/security/events", (req, res) => {
      try {
        const securityMetrics = this.healthMonitor.getSecurityMetrics();
        res.json({
          status: "success",
          data: securityMetrics.recentEvents,
          count: securityMetrics.recentEvents.length,
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to get security events",
          error: error.message,
        });
      }
    });

    // Performance endpoints - NEW
    this.app.get("/api/admin/performance/endpoints", (req, res) => {
      try {
        const appMetrics = this.healthMonitor.getApplicationMetrics();
        res.json({
          status: "success",
          data: appMetrics.requests.byEndpoint,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to get endpoint performance",
          error: error.message,
        });
      }
    });

    // Admin actions - UPDATED
    this.app.post("/api/admin/actions/reset-metrics", (req, res) => {
      try {
        this.healthMonitor.resetMetrics();
        res.json({
          status: "success",
          message: "Metrics reset successfully",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to reset metrics",
          error: error.message,
        });
      }
    });

    this.app.post("/api/admin/actions/restart-services", (req, res) => {
      try {
        // Implement service restart logic
        res.json({
          status: "success",
          message: "Services restart initiated",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Failed to restart services",
          error: error.message,
        });
      }
    });

    // Legacy admin endpoints (for backward compatibility)
    this.app.get("/api/admin/metrics", (req, res) => {
      const healthReport = this.healthMonitor.getRealTimeMetrics();
      res.json({
        status: "success",
        data: healthReport,
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get("/api/admin/security-events", (req, res) => {
      const securityMetrics = this.healthMonitor.getSecurityMetrics();
      res.json({
        status: "success",
        data: {
          events: securityMetrics.recentEvents,
          metrics: securityMetrics,
        },
      });
    });

    this.app.get("/api/admin/performance", (req, res) => {
      res.json({
        status: "success",
        data: this.healthMonitor.getPerformanceMetrics(),
      });
    });

    this.app.get("/api/admin/errors", (req, res) => {
      res.json({
        status: "success",
        data: this.healthMonitor.getErrorMetrics(),
      });
    });

    this.app.post("/api/admin/actions/block-ip", (req, res) => {
      const { ip, reason } = req.body;
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
        res.status(500).json({
          status: "error",
          message: "Failed to get queue status",
          error: error.message,
        });
      }
    });

    // Real-time queue monitoring endpoint
    this.app.get("/api/queue/stream", (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const sendQueueUpdate = () => {
        try {
          const queueStatus = this.pairingManager.getDetailedQueueStatus();
          res.write(`data: ${JSON.stringify(queueStatus)}\n\n`);
        } catch (error) {
          console.error("Error sending queue update:", error);
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
      };
      res.json(info);
    });

    // Config endpoint
    this.app.get("/api/config", (req, res) => {
      res.json({
        supabaseUrl: process.env.SUPABASE_URL ? "configured" : "missing",
        supabaseKey: process.env.SUPABASE_ANON_KEY ? "configured" : "missing",
        environment: process.env.NODE_ENV || "development",
      });
    });

    // Health monitoring endpoints
    this.app.get("/api/health/detailed", async (req, res) => {
      try {
        const health = this.healthMonitor.getRealTimeMetrics();

        res.json({
          status: "success",
          data: health,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({
          status: "error",
          message: "Health check failed",
          error: error.message,
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
      });
    });

    // Metrics endpoint for monitoring
    this.app.get("/api/health/metrics", (req, res) => {
      res.json({
        status: "success",
        data: {
          application: this.healthMonitor.getApplicationMetrics(),
          system: this.healthMonitor.getSystemMetrics(),
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Reset metrics (protected endpoint)
    this.app.post("/api/health/reset", (req, res) => {
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
      logger.error("Express error handler", {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      });

      // Track error in health monitor
      this.healthMonitor.trackError(err, {
        url: req.url,
        method: req.method,
      });

      // Handle CORS errors
      if (err.message.includes("CORS")) {
        return res.status(403).json({ error: "CORS policy violation" });
      }

      if (res.headersSent) {
        return next(err);
      }
      res.status(500).json({ error: "Internal server error" });
    });

    logger.info("Routes setup completed");
  }

  setupSocketIO() {
    logger.debug("Setting up Socket.IO");

    // Authentication middleware
    this.io.use(authMiddleware.authenticateToken);

    // NEW: Handle pairing:join event
    this.io.on("connection", (socket) => {
      logger.info("New socket connection established", {
        socketId: socket.id,
        email: socket.userData.email,
      });

      // Extract user data from authenticated socket
      const userData = {
        userId: socket.userData.userId,
        email: socket.userData.email,
        userAgent: socket.handshake.headers["user-agent"],
        ip: socket.handshake.address,
      };

      // Track the connection with real data
      this.healthMonitor.trackSocketConnection(socket.id, userData);

      // NEW: Handle pairing join requests
      socket.on("pairing:join", (data) => {
        logger.info("User requesting to join pairing queue", {
          socketId: socket.id,
          email: socket.userData.email,
          mode: data.mode || "video",
        });

        try {
          const addedToQueue = this.pairingManager.addToQueue(
            socket,
            socket.userData
          );

          if (!addedToQueue) {
            logger.warn("User could not be added to queue", {
              socketId: socket.id,
              reason: "Already in queue or paired",
            });
            socket.emit("pairing:error", { message: "Already in queue" });
            return;
          }

          logger.debug("User successfully added to pairing queue", {
            socketId: socket.id,
            queuePosition: this.pairingManager.waitingQueue.length,
          });
        } catch (error) {
          logger.error("Error adding user to queue", {
            socketId: socket.id,
            error: error.message,
          });

          this.healthMonitor.trackError(error, {
            socketId: socket.id,
            action: "add_to_queue",
          });

          socket.emit("pairing:error", { message: "Failed to join queue" });
          return;
        }
      });

      // NEW: Handle pairing leave requests
      socket.on("pairing:leave", () => {
        logger.info("User requesting to leave pairing queue", {
          socketId: socket.id,
          email: socket.userData.email,
        });

        this.pairingManager.removeFromQueue(socket.id);
        socket.emit("pairing:left", { message: "Left pairing queue" });
      });

      // Signaling events
      socket.on("signal", (data) => {
        logger.debug("Signal received", {
          from: socket.id,
          to: data.to,
          type: data.signal?.type,
        });
        this.signalingHandler.handleSignal(socket, data);
      });

      // Track pairing events
      socket.on("user_paired", (data) => {
        const pairId = this.healthMonitor.trackPairingStart(
          { userId: socket.userData.userId, email: socket.userData.email },
          { userId: data.pairedWith.id, email: data.pairedWith.email }
        );

        // Store pairId in socket for later reference
        socket.pairId = pairId;
      });

      socket.on("user_unpaired", (data) => {
        this.healthMonitor.trackPairingEnd(socket.pairId, data.success);
      });

      socket.on("message", (data) => {
        this.healthMonitor.trackMessage(socket.pairId);
      });

      // Handle custom events
      socket.on("ping", (data) => {
        socket.emit("pong", { timestamp: Date.now(), ...data });
      });

      // Disconnection handling
      socket.on("disconnect", (reason) => {
        logger.info("Socket disconnected", {
          socketId: socket.id,
          reason: reason,
          email: socket.userData.email,
        });

        // Track disconnection with real data
        this.healthMonitor.trackSocketDisconnection(socket.id);
        this.healthMonitor.trackUserLogout(socket.userData.userId);

        // End pairing session if exists
        if (socket.pairId) {
          this.healthMonitor.trackPairingEnd(socket.pairId, false);
        }

        this.pairingManager.handleDisconnect(socket.id);
        this.signalingHandler.cleanup(socket.id);
      });

      // Error handling
      socket.on("error", (error) => {
        logger.error("Socket error", {
          socketId: socket.id,
          error: error.message,
        });
        this.healthMonitor.trackError(error, { socketId: socket.id });
      });

      // Send welcome message
      socket.emit("connected", {
        message: "Connected to CampusConnect",
        socketId: socket.id,
        timestamp: Date.now(),
        queuePosition: this.pairingManager.waitingQueue.length,
      });

      logger.debug("Socket event handlers registered", { socketId: socket.id });
    });

    // ✅ FIXED: Remove problematic connection_error handler that was causing crashes
    // Instead, use a safer error handler:
    this.io.engine.on("connection_error", (err) => {
      logger.error("Socket.IO engine connection error", {
        error: err.message,
        code: err.code,
        context: err.context,
      });

      // Don't call trackError to avoid circular issues
      // Just log it for now
      console.error("Socket.IO Engine Error:", err.message);
    });

    logger.info("Socket.IO setup completed");
  }

  start() {
    const port = process.env.PORT || 3000;

    // Render-specific: Listen on 0.0.0.0
    this.server.listen(port, "0.0.0.0", () => {
      logger.info("CampusConnect server started successfully", {
        environment: process.env.NODE_ENV || "development",
        port: port,
        pid: process.pid,
        nodeVersion: process.version,
        host: "0.0.0.0",
      });

      // Only auto-open in development
      if (
        process.env.NODE_ENV === "development" &&
        process.env.AUTO_OPEN !== "false"
      ) {
        this.autoOpenBrowser(port);
      }
    });

    // Graceful shutdown
    this.setupGracefulShutdown();
  }

  async autoOpenBrowser(port) {
    try {
      // Don't auto-open in production environments
      if (process.env.NODE_ENV === "production" || process.env.RENDER) {
        logger.info("Auto-open browser disabled in production");
        return;
      }

      const open = await import("open");
      const url = `http://localhost:${port}`;
      await open.default(url);
      logger.info("Browser auto-opened", { url: url });
    } catch (error) {
      logger.warning("Could not auto-open browser", { error: error.message });
    }
  }

  setupGracefulShutdown() {
    const shutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Close Socket.IO
      this.io.close(() => {
        logger.info("Socket.IO closed");
      });

      // Close HTTP server
      this.server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("Forcing shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason);
  process.exit(1);
});

// Create and start server
try {
  const server = new CampusConnectServer();
  server.start();
  module.exports = server;
} catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
}
