const advancedEncryption = require("../../utils/advancedEncryption");

class AdvancedSecurityMiddleware {
  constructor() {
    // LESS AGGRESSIVE PATTERNS - Fixed to avoid false positives
    this.suspiciousPatterns = [
      // SQL Injection patterns - more specific
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\s+(\w|\*|\(|\)))/i,
      /(\b(OR|AND)\s+['"]?\d+['"]?\s*[=<>])/i,
      /(--|\/\*|\*\/|;)\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/i,

      // XSS patterns - more specific
      /<script[^>]*>|<\/script>/i,
      /javascript:\s*(alert|prompt|confirm|eval)/i,
      /on(load|error|click|mouseover)\s*=/i,

      // Path traversal - more specific
      /(\.\.\/){2,}|\/\.\.\//,
      /(\/etc\/passwd|\/etc\/shadow|\/windows\/system32)/i,

      // Command injection - more specific
      /(\b(rm -rf|del \/s|chmod 777|wget\s+http|curl\s+http)\b)/i,

      // API abuse patterns - less aggressive
      /(\.env|config\.json|password|secret)[^a-zA-Z0-9]/i,
    ];

    this.rateLimitConfig = {
      maxRequestsPerMinute: 100,
      maxFailedAuthAttempts: 5,
      blockDuration: 15 * 60 * 1000, // 15 minutes
    };

    this.suspiciousIPs = new Map();
    this.requestCounts = new Map();
    this.blockedCount = 0;

    // SAFE PATHS that should never be blocked
    this.safePaths = [
      "/health",
      "/api/health",
      "/",
      "/debug-test",
      "/test-middleware",
    ];

    // SAFE USER AGENTS
    this.safeUserAgents = [/curl/i, /postman/i, /insomnia/i, /node/i, /axios/i];
  }

  // Fixed middleware function
  advancedRequestFilter() {
    return (req, res, next) => {
      try {
        const clientIP = req.ip;
        const userAgent = req.get("User-Agent") || "";
        const path = req.path;

        // ✅ SKIP SECURITY CHECKS FOR SAFE PATHS
        if (this.isSafePath(path)) {
          return next();
        }

        // ✅ SKIP SECURITY CHECKS FOR SAFE USER AGENTS (like curl)
        if (this.isSafeUserAgent(userAgent)) {
          return next();
        }

        // Check if IP is blocked
        if (this.isIPBlocked(clientIP)) {
          this.blockedCount++;
          this.logSuspiciousActivity(req, "IP_BLOCKED");
          return res.status(403).json({
            error: "IP temporarily blocked due to suspicious activity",
          });
        }

        // Check for suspicious patterns (with safe path bypass)
        if (this.isSuspiciousRequest(req)) {
          this.blockedCount++;
          this.logSuspiciousActivity(req, "SUSPICIOUS_REQUEST_PATTERN");
          return res.status(403).json({
            error: "Request blocked by security policy",
          });
        }

        // Rate limiting per IP
        if (!this.checkRateLimit(clientIP)) {
          this.blockedCount++;
          this.logSuspiciousActivity(req, "RATE_LIMIT_EXCEEDED");
          return res.status(429).json({
            error: "Too many requests. Please try again later.",
          });
        }

        // User agent analysis (log only, don't block)
        if (this.isSuspiciousUserAgent(userAgent)) {
          this.logSuspiciousActivity(req, "SUSPICIOUS_USER_AGENT");
          // Don't block, just log
        }

        next(); // Always call next() if request passes all checks
      } catch (error) {
        console.error("Security middleware error:", error);
        next(); // Continue on error to avoid breaking the application
      }
    };
  }

  // ✅ NEW: Check if path is safe (should never be blocked)
  isSafePath(path) {
    return this.safePaths.some(
      (safePath) => path === safePath || path.startsWith(safePath + "/")
    );
  }

  // ✅ NEW: Check if user agent is safe (like curl, postman, etc.)
  isSafeUserAgent(userAgent) {
    return this.safeUserAgents.some((pattern) => pattern.test(userAgent));
  }

  isIPBlocked(ip) {
    const now = Date.now();
    const blockedData = this.suspiciousIPs.get(ip);

    if (blockedData && now < blockedData.blockedUntil) {
      return true;
    }

    // Clean up if block duration has expired
    if (blockedData && now >= blockedData.blockedUntil) {
      this.suspiciousIPs.delete(ip);
    }

    return false;
  }

  isSuspiciousRequest(req) {
    // ✅ SKIP HEADER CHECK FOR SAFE PATHS/USER AGENTS
    if (
      this.isSafePath(req.path) ||
      this.isSafeUserAgent(req.get("User-Agent") || "")
    ) {
      return false;
    }

    // Check headers (excluding safe ones)
    const safeHeaders = [
      "host",
      "user-agent",
      "accept",
      "content-type",
      "content-length",
      "connection",
    ];
    for (let [key, value] of Object.entries(req.headers)) {
      if (safeHeaders.includes(key.toLowerCase())) continue;

      if (this.checkSuspiciousPatterns(value.toString())) {
        console.log(`🚨 Suspicious header detected: ${key} = ${value}`);
        return true;
      }
    }

    // Check body (if exists and not empty)
    if (
      req.body &&
      typeof req.body === "object" &&
      Object.keys(req.body).length > 0
    ) {
      const bodyString = JSON.stringify(req.body);
      if (this.checkSuspiciousPatterns(bodyString)) {
        console.log(
          `🚨 Suspicious body detected: ${bodyString.substring(0, 100)}`
        );
        return true;
      }
    }

    // Check query parameters
    if (
      req.query &&
      typeof req.query === "object" &&
      Object.keys(req.query).length > 0
    ) {
      const queryString = JSON.stringify(req.query);
      if (this.checkSuspiciousPatterns(queryString)) {
        console.log(`🚨 Suspicious query detected: ${queryString}`);
        return true;
      }
    }

    // Check URL path (excluding safe paths)
    if (!this.isSafePath(req.path) && this.checkSuspiciousPatterns(req.path)) {
      console.log(`🚨 Suspicious path detected: ${req.path}`);
      return true;
    }

    return false;
  }

  checkSuspiciousPatterns(input) {
    // Skip empty inputs
    if (!input || input.trim() === "") return false;

    // Skip very short inputs (likely false positives)
    if (input.length < 5) return false;

    return this.suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  checkRateLimit(ip) {
    // ✅ SKIP RATE LIMITING FOR SAFE PATHS
    if (this.isSafePath(req?.path)) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Clean old entries
    this.cleanupOldEntries(now);

    if (!this.requestCounts.has(ip)) {
      this.requestCounts.set(ip, []);
    }

    const requests = this.requestCounts.get(ip);

    // Remove requests outside current window
    const recentRequests = requests.filter((time) => time > windowStart);
    this.requestCounts.set(ip, recentRequests);

    // Check if over limit
    if (recentRequests.length >= this.rateLimitConfig.maxRequestsPerMinute) {
      // Add to suspicious IPs
      if (!this.suspiciousIPs.has(ip)) {
        this.suspiciousIPs.set(ip, {
          blockedUntil: now + this.rateLimitConfig.blockDuration,
          reason: "RATE_LIMIT_EXCEEDED",
        });
      }
      return false;
    }

    // Add current request
    recentRequests.push(now);
    return true;
  }

  isSuspiciousUserAgent(userAgent) {
    // Skip if user agent is empty or safe
    if (
      !userAgent ||
      userAgent.trim() === "" ||
      this.isSafeUserAgent(userAgent)
    ) {
      return false;
    }

    const suspiciousAgents = [
      /bot|crawler|spider|scraper/i,
      /python|java|php|ruby/i,
      /unknown|undefined|null|test/i,
    ];

    return suspiciousAgents.some((pattern) => pattern.test(userAgent));
  }

  cleanupOldEntries(now) {
    // Clean request counts
    for (let [ip, requests] of this.requestCounts) {
      const recentRequests = requests.filter((time) => time > now - 60000);
      if (recentRequests.length === 0) {
        this.requestCounts.delete(ip);
      } else {
        this.requestCounts.set(ip, recentRequests);
      }
    }

    // Clean suspicious IPs
    for (let [ip, data] of this.suspiciousIPs) {
      if (now > data.blockedUntil) {
        this.suspiciousIPs.delete(ip);
      }
    }
  }

  logSuspiciousActivity(req, reason) {
    // ✅ DON'T LOG SAFE PATHS/USER AGENTS
    if (
      this.isSafePath(req.path) ||
      this.isSafeUserAgent(req.get("User-Agent") || "")
    ) {
      return;
    }

    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get("User-Agent"),
      reason: reason,
    };

    console.warn("🔒 SECURITY ALERT:", logData);

    // Also track in health monitor
    if (typeof req.app !== "undefined" && req.app.healthMonitor) {
      req.app.healthMonitor.trackSecurityEvent("waf_blocked", {
        ip: req.ip,
        reason: reason,
        path: req.path,
        severity: "high",
      });
    }
  }

  // Get security dashboard data
  getSecurityMetrics() {
    return {
      suspiciousIPs: this.suspiciousIPs.size,
      totalBlockedRequests: this.blockedCount,
      currentRateLimits: this.requestCounts.size,
      safePaths: this.safePaths,
    };
  }

  getBlockedCount() {
    return this.blockedCount;
  }

  // Reset metrics (for testing)
  reset() {
    this.suspiciousIPs.clear();
    this.requestCounts.clear();
    this.blockedCount = 0;
  }

  // ✅ NEW: Add safe path dynamically
  addSafePath(path) {
    if (!this.safePaths.includes(path)) {
      this.safePaths.push(path);
    }
  }

  // ✅ NEW: Add safe user agent pattern dynamically
  addSafeUserAgent(pattern) {
    this.safeUserAgents.push(new RegExp(pattern, "i"));
  }
}

// Export class instance with proper middleware function
module.exports = new AdvancedSecurityMiddleware();
