require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// Import configurations
const securityConfig = require("./config/security");
const constants = require("./config/constants");

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

    logger.info("CampusConnectServer instance created");
  }

  setupMiddleware() {
    logger.debug("Setting up middleware");

    // CHANGE 1: Trust the proxy
    // This is crucial for rate limiting and getting the correct IP address on Render
    this.app.set("trust proxy", 1); // <-- ADD THIS LINE

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

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      logger.debug("Health check requested");
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: process.uptime(),
      });
    });

    // Server info endpoint (for debugging)
    this.app.get("/api/info", (req, res) => {
      const info = {
        server: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
        },
        pairing: this.pairingManager.getQueueStatus(),
      };
      res.json(info);
    });

    // Serve main application
    this.app.get("*", (req, res) => {
      logger.debug("Serving static file", { path: req.path });
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // 404 handler
    this.app.use("*", (req, res) => {
      logger.warn("404 Not Found", { url: req.originalUrl });
      res.status(404).json({ error: "Not found" });
    });

    // Error handling
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

      res.status(500).json({
        error:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
      });
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
      const addedToQueue = pairingManager.addToQueue(socket, socket.userData);

      if (!addedToQueue) {
        logger.warn("User could not be added to queue", {
          socketId: socket.id,
          reason: "Already in queue or paired",
        });
        socket.emit("error", { message: "Already in queue" });
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

  // Auto-open browser method
  async autoOpenBrowser(port) {
    try {
      // Use dynamic import for the open package (works even if not installed)
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

      // Fallback: Try using native commands
      this.fallbackOpenBrowser(port);
    }
  }

  // Fallback method using native commands
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
