// server/utils/logger.js - FIXED VERSION (No Circular Dependency)
const winston = require("winston");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Simple, stable logger without circular dependencies
const LOG_LEVELS = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    debug: "blue",
  },
};

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create the logger
const logger = winston.createLogger({
  levels: LOG_LEVELS.levels,
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss.SSS",
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: "campusconnect-server",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Add console transport
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({
          format: "HH:mm:ss.SSS",
        }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const symbols = {
            error: "❌",
            warn: "⚠️",
            info: "ℹ️",
            debug: "🔍",
          };

          let log = `${timestamp} ${
            symbols[level] || "📝"
          } [${level.toUpperCase()}]: ${message}`;

          if (Object.keys(meta).length > 0 && !meta.stack) {
            log += ` ${JSON.stringify(meta)}`;
          }

          return log;
        })
      ),
      level: "debug",
    })
  );
} else {
  logger.add(
    new winston.transports.Console({
      level: "info",
    })
  );
}

// Add domain-specific methods WITHOUT circular references
logger.auth = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "auth" });
};

logger.socket = (message, meta = {}) => {
  logger.debug(message, { ...meta, type: "socket" });
};

logger.webrtc = (message, meta = {}) => {
  logger.debug(message, { ...meta, type: "webrtc" });
};

logger.database = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "database" });
};

logger.api = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "api" });
};

logger.security = (message, meta = {}) => {
  logger.warn(message, { ...meta, type: "security" });
};

// Initialize colors
winston.addColors(LOG_LEVELS.colors);

module.exports = logger;
