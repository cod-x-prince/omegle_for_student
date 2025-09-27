const winston = require("winston");

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "campusconnect-server" },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      handleExceptions: true,
    }),

    // Combined logs
    new winston.transports.File({
      filename: "logs/combined.log",
    }),

    // Console output in development
    ...(process.env.NODE_ENV !== "production"
      ? [
          new winston.transports.Console({
            format: winston.format.simple(),
          }),
        ]
      : []),
  ],
});

// Security: Don't log sensitive information
logger.addRedaction = (path) => {
  logger.format = winston.format.combine(
    winston.format.redact({ paths: path }),
    logFormat
  );
};

module.exports = logger;
