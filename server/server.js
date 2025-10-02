require("dotenv").config();
//---------------------------------
console.log("🚀 Starting server...");
console.log("Environment:", process.env.NODE_ENV);
console.log("Supabase URL configured:", !!process.env.SUPABASE_URL);
console.log("JWT Secret configured:", !!process.env.JWT_SECRET);

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

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
//---------------------------------

// Database (SUPABASE) Setup
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

// Enhanced Supabase client with better error handling
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

// Import modules - CORRECT PATHS:
const authMiddleware = require("./modules/auth/authMiddleware");
const PairingManager = require("./modules/pairing/pairingManager");
const SignalingHandler = require("./modules/signaling/signalingHandler");
const logger = require("./utils/logger");

class CampusConnectServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: securityConfig.corsConfig,
    });

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

    // API route for signup - IMPROVED VERSION
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
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // API route for login - IMPROVED VERSION
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
        res.status(500).json({ error: "Internal server error" });
      }
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

    // Serve HTML files explicitly - FIXED ROUTING
    const htmlFiles = ["/", "/login", "/signup", "/dashboard", "/chat"];
    htmlFiles.forEach((route) => {
      this.app.get(route, (req, res) => {
        let file = "index.html";
        if (route === "/login") file = "login.html";
        else if (route === "/signup") file = "signup.html";
        else if (route === "/dashboard") file = "dashboard.html";
        else if (route === "/chat") file = "chat.html";

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

    // Connection handling
    this.io.on("connection", (socket) => {
      logger.info("New socket connection established", {
        socketId: socket.id,
        email: socket.userData.email,
      });

      // Add to pairing queue
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
          socket.emit("error", { message: "Already in queue" });
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
        socket.emit("error", { message: "Failed to join queue" });
        return;
      }

      // Signaling events
      socket.on("signal", (data) => {
        logger.debug("Signal received", {
          from: socket.id,
          to: data.to,
          type: data.signal?.type,
        });
        this.signalingHandler.handleSignal(socket, data);
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

        this.pairingManager.handleDisconnect(socket.id);
        this.signalingHandler.cleanup(socket.id);
      });

      // Error handling
      socket.on("error", (error) => {
        logger.error("Socket error", {
          socketId: socket.id,
          error: error.message,
        });
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

    // Server error handling
    this.io.engine.on("connection_error", (err) => {
      logger.error("Socket.IO engine connection error", {
        error: err.message,
        code: err.code,
      });
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
      const open = await import("open");
      const url = `http://localhost:${port}`;
      await open.default(url);
      logger.info("Browser auto-opened", { url: url });
    } catch (error) {
      logger.warn("Could not auto-open browser", { error: error.message });
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
