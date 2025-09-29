require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Import configurations
const securityConfig = require("./config/security");
const constants = require("./config/constants");
// Database (SUPABASE) Setup
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Import modules
const authMiddleware = require("./modules/auth/authMiddleware");
const PairingManager = require("./modules/pairing/pairingManager");
const signalingHandler = require("./modules/signaling/signalingHandler");
const logger = require("./utils/logger");

class CampusConnectServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: securityConfig.corsConfig,
    });

    this.pairingManager = new PairingManager(this.io);
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

    // Trust proxy configuration
    this.app.set("trust proxy", 1);
    logger.info("Proxy configuration", {
      trustProxy: this.app.get("trust proxy"),
      nodeEnv: process.env.NODE_ENV,
    });

    // Security middleware
    this.app.use(securityConfig.helmetConfig);
    this.app.use(securityConfig.rateLimitConfig);

    // Static files
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

    // API route for signup
    this.app.post("/api/auth/signup", async (req, res) => {
      try {
        const { email, password, firstName, lastName, college, major } =
          req.body;

        logger.info("Signup attempt", {
          email: email,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
        });

        // Validate required fields
        if (!email || !password) {
          logger.warn("Signup missing required fields", { email: email });
          return res.status(400).json({
            error: "Email and password are required",
          });
        }

        // Validate email domain
        const allowedDomains = [".edu", "@cmrit.ac.in"];
        const isValidEmail = allowedDomains.some((domain) =>
          email.toLowerCase().endsWith(domain.toLowerCase())
        );

        if (!isValidEmail) {
          logger.warn("Invalid email domain attempted", { email: email });
          return res.status(400).json({
            error:
              "Please use a valid college email address (.edu or @cmrit.ac.in)",
          });
        }

        // Validate password
        if (password.length < 6) {
          logger.warn("Password too short", { email: email });
          return res.status(400).json({
            error: "Password must be at least 6 characters long",
          });
        }

        const { data, error } = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              college: college,
              major: major,
            },
          },
        });

        if (error) {
          logger.error("Signup Supabase error", {
            error: error.message,
            email: email,
            status: error.status,
          });
          return res.status(400).json({ error: error.message });
        }

        logger.info("User signed up successfully", {
          email: email,
          userId: data.user?.id,
        });

        res.status(200).json({
          message: "Signup successful! Check your email for verification.",
          user: data.user,
        });
      } catch (error) {
        logger.error("Signup route unexpected error", {
          error: error.message,
          stack: error.stack,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // API route for login
    this.app.post("/api/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        logger.info("Login attempt", {
          email: email,
          ip: req.ip,
        });

        if (!email || !password) {
          logger.warn("Login missing credentials", { email: email });
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
            status: error.status,
          });
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const jwt = require("jsonwebtoken");
        const token = jwt.sign(
          {
            userId: data.user.id,
            email: data.user.email,
          },
          process.env.JWT_SECRET,
          { expiresIn: "1h" }
        );

        logger.info("User logged in successfully", {
          email: email,
          userId: data.user.id,
        });

        res.status(200).json({
          message: "Login successful",
          token,
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
      logger.debug("Health check requested", { ip: req.ip });
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
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
      logger.debug("Server info requested", { ip: req.ip });
      res.json(info);
    });

    // Config endpoint
    this.app.get("/api/config", (req, res) => {
      logger.debug("Config requested", { ip: req.ip });
      res.json({
        supabaseUrl: process.env.SUPABASE_URL ? "configured" : "missing",
        supabaseKey: process.env.SUPABASE_ANON_KEY ? "configured" : "missing",
        environment: process.env.NODE_ENV || "development",
      });
    });

    // 404 handler for API routes
    this.app.use("/api/*", (req, res) => {
      logger.warn("404 Not Found for API route", {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
      });
      res.status(404).json({ error: "API endpoint not found" });
    });

    // Serve main application for SPA routing
    this.app.get("*", (req, res) => {
      if (
        !req.path.startsWith("/api/") &&
        ![
          "/chat.html",
          "/login.html",
          "/signup.html",
          "/dashboard.html",
        ].includes(req.path)
      ) {
        res.sendFile(path.join(__dirname, "../public/index.html"));
      }
    });

    // In setupRoutes() method, add:
    this.app.get("/dashboard.html", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/dashboard.html"));
    });

    // Final Express error handler
    this.app.use((err, req, res, next) => {
      logger.error("Express error handler", {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      });
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
        handshake: {
          address: socket.handshake.address,
          headers: socket.handshake.headers,
        },
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
          stack: error.stack,
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
        signalingHandler.handleSignal(socket, data);
      });

      // Handle custom events
      socket.on("ping", (data) => {
        logger.debug("Ping received", { socketId: socket.id });
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
        signalingHandler.cleanup(socket.id);
      });

      // Error handling
      socket.on("error", (error) => {
        logger.error("Socket error", {
          socketId: socket.id,
          error: error.message,
          stack: error.stack,
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
        context: err.context,
      });
    });

    logger.info("Socket.IO setup completed");
  }

  start() {
    const port = process.env.PORT || 3000;

    this.server.listen(port, () => {
      logger.info("CampusConnect server started successfully", {
        environment: process.env.NODE_ENV || "development",
        port: port,
        pid: process.pid,
        nodeVersion: process.version,
      });

      // Auto-open browser in development mode
      if (
        process.env.NODE_ENV !== "production" &&
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
      logger.info("Browser auto-opened successfully", {
        url: url,
        platform: process.platform,
      });
    } catch (error) {
      logger.warn("Could not auto-open browser", {
        error: error.message,
        suggestion: "Please install the 'open' package: npm install open",
      });

      this.fallbackOpenBrowser(port);
    }
  }

  fallbackOpenBrowser(port) {
    try {
      const { exec } = require("child_process");
      const url = `http://localhost:${port}`;

      if (process.platform === "win32") {
        exec(`start ${url}`);
      } else if (process.platform === "darwin") {
        exec(`open ${url}`);
      } else {
        exec(`xdg-open ${url}`);
      }

      logger.info("Browser opened using fallback method", { url: url });
    } catch (error) {
      logger.info("Please open browser manually", {
        url: `http://localhost:${port}`,
      });
    }
  }

  setupGracefulShutdown() {
    const shutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`, {
        activeConnections: this.io.engine.clientsCount,
        activePairs: this.pairingManager.activePairs.size / 2,
      });

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

    logger.debug("Graceful shutdown handlers registered");
  }
}

// Handle uncaught exceptions at the top level
process.on("uncaughtException", (error) => {
  logger.error("TOP LEVEL - Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("TOP LEVEL - Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : reason,
    promise: promise,
  });
  process.exit(1);
});

// Create and start server
try {
  const server = new CampusConnectServer();
  server.start();

  // Export for testing
  module.exports = server;
} catch (error) {
  logger.error("Failed to start server", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
}
