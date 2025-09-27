const winston = require("winston");
const path = require("path");

// Ensure logs directory exists
const fs = require("fs");
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format with colors
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: {
    service: "campusconnect-server",
    pid: process.pid,
  },
  transports: [
    // Error logs (always logged)
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined logs (info and above)
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Console output with colors in development
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
      silent: process.env.NODE_ENV === "test", // Silent during tests
    }),
  ],

  // Do not exit on handled exceptions
  exitOnError: false,
});

// Add stream for Express morgan (if you want HTTP request logging)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Helper methods for different log levels
logger.debug = (message, meta) => {
  logger.log("debug", message, meta);
};

logger.info = (message, meta) => {
  logger.log("info", message, meta);
};

logger.warn = (message, meta) => {
  logger.log("warn", message, meta);
};

logger.error = (message, meta) => {
  logger.log("error", message, meta);
};

// Security: Don't log sensitive information
logger.addRedaction = (path) => {
  logger.format = winston.format.combine(
    winston.format.redact({ paths: path }),
    logFormat
  );
};

// Log unhandled exceptions and promise rejections
process.on("uncaughtException", (error) => {
  logger.error("UNCAUGHT EXCEPTION - Shutting down...", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED PROMISE REJECTION - Shutting down...", {
    reason: reason instanceof Error ? reason.message : reason,
    promise: promise,
  });
  process.exit(1);
});

// Log startup information
logger.info("Logger initialized successfully", {
  environment: process.env.NODE_ENV || "development",
  logLevel: logger.level,
  nodeVersion: process.version,
  platform: process.platform,
});

module.exports = logger;
