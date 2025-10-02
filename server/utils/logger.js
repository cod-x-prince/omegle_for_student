// server/utils/logger.js - ELITE LEVEL LOGGING (COMPATIBLE VERSION)
const winston = require("winston");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

// Enhanced log configuration with backward compatibility
const LOG_LEVELS = {
  levels: {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
    trace: 8,
  },
  colors: {
    emergency: "red",
    alert: "red",
    critical: "red",
    error: "red",
    warning: "yellow",
    notice: "cyan",
    info: "green",
    debug: "blue",
    trace: "magenta",
  },
};

// Ensure logs directory structure
const logsBaseDir = path.join(__dirname, "../logs");
const logDirs = ["application", "security", "performance", "audit", "errors"];

logDirs.forEach((dir) => {
  const logDir = path.join(logsBaseDir, dir);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
});

// Custom formats
const eliteFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: "HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const symbols = {
      emergency: "🚨",
      alert: "🚩",
      critical: "💥",
      error: "❌",
      warning: "⚠️",
      notice: "📢",
      info: "ℹ️",
      debug: "🔍",
      trace: "🧵",
    };

    let log = `${timestamp} ${
      symbols[level] || "📝"
    } [${level.toUpperCase()}]: ${message}`;

    if (stack) {
      log += `\n${stack}`;
    }

    if (Object.keys(meta).length > 0) {
      const cleanMeta = Object.entries(meta).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null && !key.startsWith("_")) {
          acc[key] = value;
        }
        return acc;
      }, {});

      if (Object.keys(cleanMeta).length > 0) {
        log += `\n${JSON.stringify(cleanMeta, null, 2)}`;
      }
    }

    return log;
  })
);

// Create the elite logger
const logger = winston.createLogger({
  levels: LOG_LEVELS.levels,
  level: process.env.LOG_LEVEL || "info",
  format: eliteFormat,
  defaultMeta: {
    service: "campusconnect-server",
    environment: process.env.NODE_ENV || "development",
    hostname: os.hostname(),
    pid: process.pid,
    nodeVersion: process.version,
  },
  transports: [
    // Application logs (all levels)
    new winston.transports.File({
      filename: "logs/application/application.log",
      level: "debug",
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),

    // Error logs (errors and above)
    new winston.transports.File({
      filename: "logs/errors/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true,
    }),

    // Security logs
    new winston.transports.File({
      filename: "logs/security/security.log",
      level: "notice",
      maxsize: 5242880,
      maxFiles: 5,
    }),

    // Performance logs
    new winston.transports.File({
      filename: "logs/performance/performance.log",
      level: "info",
      maxsize: 5242880,
      maxFiles: 3,
    }),

    // Audit logs
    new winston.transports.File({
      filename: "logs/audit/audit.log",
      level: "notice",
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Add console transport with different levels based on environment
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: "trace",
    })
  );
} else {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: "info",
    })
  );
}

// Security: Redact sensitive information
const sensitiveFields = [
  "password",
  "token",
  "authorization",
  "jwt",
  "secret",
  "key",
  "access_token",
  "refresh_token",
  "api_key",
  "private_key",
  "credit_card",
  "ssn",
  "phone",
  "address",
];

const redactionFormat = winston.format((info) => {
  if (info.message && typeof info.message === "object") {
    info.message = redactSensitiveInfo(info.message);
  }
  if (info.meta && typeof info.meta === "object") {
    info.meta = redactSensitiveInfo(info.meta);
  }
  return info;
});

function redactSensitiveInfo(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    if (
      sensitiveFields.some((field) =>
        key.toLowerCase().includes(field.toLowerCase())
      )
    ) {
      redacted[key] = "🔒 [REDACTED]";
    } else if (typeof redacted[key] === "object") {
      redacted[key] = redactSensitiveInfo(redacted[key]);
    } else if (
      typeof redacted[key] === "string" &&
      redacted[key].length > 500
    ) {
      redacted[key] = redacted[key].substring(0, 500) + "... [TRUNCATED]";
    }
  }

  return redacted;
}

logger.format = winston.format.combine(redactionFormat(), eliteFormat);

// BACKWARD COMPATIBILITY: Add alias methods
logger.warn = logger.warning; // Add warn alias for backward compatibility
logger.log = logger.info; // Add log alias

// Performance monitoring
class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
  }

  start(operation) {
    const id = uuidv4();
    this.metrics.set(id, {
      operation,
      startTime: process.hrtime.bigint(),
      startTimestamp: Date.now(),
    });
    return id;
  }

  end(id, metadata = {}) {
    const metric = this.metrics.get(id);
    if (!metric) return null;

    const endTime = process.hrtime.bigint();
    const durationNs = Number(endTime - metric.startTime);
    const durationMs = durationNs / 1000000;

    this.metrics.delete(id);

    return {
      operation: metric.operation,
      durationMs: Math.round(durationMs * 100) / 100,
      durationNs,
      startTimestamp: metric.startTimestamp,
      endTimestamp: Date.now(),
      ...metadata,
    };
  }
}

const performanceTracker = new PerformanceTracker();

// Enhanced logging methods with context
logger.performance = (operation, metadata = {}) => {
  const perfId = performanceTracker.start(operation);

  return {
    end: (endMetadata = {}) => {
      const result = performanceTracker.end(perfId, {
        ...metadata,
        ...endMetadata,
      });
      if (result) {
        logger.info(`Performance: ${operation}`, {
          ...result,
          type: "performance",
        });

        // Log slow operations as warnings
        if (result.durationMs > 1000) {
          logger.warning(`Slow operation detected: ${operation}`, {
            durationMs: result.durationMs,
            threshold: 1000,
            type: "performance_slow",
          });
        }
      }
      return result;
    },

    fail: (error, endMetadata = {}) => {
      const result = performanceTracker.end(perfId, {
        ...metadata,
        ...endMetadata,
        error: error.message,
        success: false,
      });
      if (result) {
        logger.error(`Performance failed: ${operation}`, {
          ...result,
          type: "performance_error",
        });
      }
      return result;
    },
  };
};

// Domain-specific logging methods
logger.security = (message, meta = {}) => {
  logger.notice(message, { ...meta, type: "security", category: "security" });
};

logger.auth = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "auth", category: "security" });
};

logger.socket = (message, meta = {}) => {
  logger.debug(message, { ...meta, type: "socket", category: "realtime" });
};

logger.webrtc = (message, meta = {}) => {
  logger.debug(message, { ...meta, type: "webrtc", category: "media" });
};

logger.database = (message, meta = {}) => {
  logger.info(message, { ...meta, type: "database", category: "persistence" });
};

logger.api = (message, meta = {}) => {
  const { method, url, statusCode, responseTime, userAgent, ip } = meta;

  logger.info(message, {
    method,
    url,
    statusCode,
    responseTime,
    userAgent,
    ip,
    type: "api",
    category: "http",
  });
};

logger.business = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    type: "business",
    category: "business_logic",
  });
};

// Alerting methods
logger.alert = (message, meta = {}) => {
  logger.alert(message, { ...meta, type: "alert", urgent: true });

  // In production, you could integrate with external alerting systems here
  if (process.env.NODE_ENV === "production") {
    console.error(`🚨 ALERT: ${message}`, meta);
  }
};

logger.critical = (message, meta = {}) => {
  logger.critical(message, { ...meta, type: "critical", urgent: true });

  if (process.env.NODE_ENV === "production") {
    console.error(`💥 CRITICAL: ${message}`, meta);
  }
};

// Audit logging for compliance
logger.audit = (action, user, resource, meta = {}) => {
  logger.notice(`Audit: ${action}`, {
    action,
    user: user?.id || user?.email || "unknown",
    resource,
    timestamp: new Date().toISOString(),
    ip: meta.ip,
    userAgent: meta.userAgent,
    type: "audit",
    category: "compliance",
  });
};

// Startup and shutdown logging
logger.startup = (service, meta = {}) => {
  logger.info(`${service} starting`, {
    ...meta,
    type: "startup",
    pid: process.pid,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
  });
};

logger.shutdown = (service, meta = {}) => {
  logger.info(`${service} shutting down`, {
    ...meta,
    type: "shutdown",
    uptime: process.uptime(),
    exitReason: meta.reason || "normal",
  });
};

// Health check logging
logger.health = (component, status, details = {}) => {
  const level =
    status === "healthy" ? "info" : status === "degraded" ? "warning" : "error";

  logger[level](`Health check: ${component} - ${status}`, {
    component,
    status,
    ...details,
    type: "health",
    category: "monitoring",
  });
};

// Request context tracking
logger.withContext = (context) => {
  return {
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    debug: (message, meta = {}) =>
      logger.debug(message, { ...context, ...meta }),
    error: (message, meta = {}) =>
      logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warning(message, { ...context, meta }), // Backward compat
    warning: (message, meta = {}) =>
      logger.warning(message, { ...context, ...meta }),
    // Include all other methods...
    performance: (operation, meta = {}) =>
      logger.performance(operation, { ...context, ...meta }),
  };
};

// Error context enrichment
logger.enrichError = (error, context = {}) => {
  return {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    ...context,
    type: "error_enriched",
  };
};

// Metrics and statistics
logger.getStats = () => {
  return {
    level: logger.level,
    transports: logger.transports.map((t) => t.name || t.constructor.name),
    silent: logger.silent,
    metricsCount: performanceTracker.metrics.size,
  };
};

// Handle logger errors gracefully
logger.on("error", (error) => {
  console.error("📛 Logger error:", error);
});

// Initialize colors
winston.addColors(LOG_LEVELS.colors);

module.exports = logger;
