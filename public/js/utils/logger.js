// Frontend logger utility (browser-compatible)
class FrontendLogger {
  constructor() {
    this.enabled = true;
    this.level = "debug"; // debug, info, warn, error
  }

  debug(message, data = {}) {
    if (this.shouldLog("debug")) {
      console.log(`🔍 [DEBUG] ${message}`, data);
    }
  }

  info(message, data = {}) {
    if (this.shouldLog("info")) {
      console.log(`ℹ️ [INFO] ${message}`, data);
    }
  }

  warn(message, data = {}) {
    if (this.shouldLog("warn")) {
      console.warn(`⚠️ [WARN] ${message}`, data);
    }
  }

  error(message, data = {}) {
    if (this.shouldLog("error")) {
      console.error(`❌ [ERROR] ${message}`, data);
    }
  }

  log(message, data = {}) {
    this.info(message, data);
  }

  shouldLog(level) {
    if (!this.enabled) return false;

    const levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.level];
  }

  // Socket-specific logging
  socket(message, data = {}) {
    this.info(`[SOCKET] ${message}`, data);
  }

  // Video-specific logging
  video(message, data = {}) {
    this.debug(`[VIDEO] ${message}`, data);
  }

  // Auth-specific logging
  auth(message, data = {}) {
    this.info(`[AUTH] ${message}`, data);
  }
}

// Create global logger instance
window.logger = new FrontendLogger();
