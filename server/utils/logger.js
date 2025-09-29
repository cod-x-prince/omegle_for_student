const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format with more details
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Simple format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: "HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    if (stack) {
      log += `\n${stack}`;
    }

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
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined logs
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Debug logs (only in development)
    ...(process.env.NODE_ENV !== "production"
      ? [
          new winston.transports.File({
            filename: "logs/debug.log",
            level: "debug",
            maxsize: 5242880,
            maxFiles: 3,
          }),
        ]
      : []),
  ],
});

// Add console transport in non-production environments
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.LOG_LEVEL || "debug",
    })
  );
} else {
  // In production, only log warnings and errors to console
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: "warn",
    })
  );
}

// Security: Don't log sensitive information
const sensitiveFields = [
  "password",
  "token",
  "authorization",
  "jwt",
  "secret",
  "key",
];

logger.format = winston.format.combine(
  winston.format((info) => {
    // Redact sensitive information
    if (info.message && typeof info.message === "object") {
      info.message = redactSensitiveInfo(info.message);
    }
    if (info.meta && typeof info.meta === "object") {
      info.meta = redactSensitiveInfo(info.meta);
    }
    return info;
  })(),
  logFormat
);

function redactSensitiveInfo(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const redacted = { ...obj };

  for (const key in redacted) {
    if (
      sensitiveFields.some((field) =>
        key.toLowerCase().includes(field.toLowerCase())
      )
    ) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object") {
      redacted[key] = redactSensitiveInfo(redacted[key]);
    }
  }

  return redacted;
}

// Utility methods for structured logging
logger.api = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "api" });
};

logger.socket = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "socket" });
};

logger.database = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "database" });
};

logger.auth = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "auth" });
};

logger.webrtc = (message, meta = {}) => {
  logger.debug(message, { ...meta, type: "webrtc" });
};

// Method to log startup information
logger.startup = (service, meta = {}) => {
  logger.info(`${service} started`, {
    ...meta,
    type: "startup",
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
  });
};

// Method to log shutdown information
logger.shutdown = (service, meta = {}) => {
  logger.info(`${service} shutdown`, {
    ...meta,
    type: "shutdown",
    uptime: process.uptime(),
  });
};

// Handle logger errors
logger.on("error", (error) => {
  console.error("Logger error:", error);
});

module.exports = logger;
