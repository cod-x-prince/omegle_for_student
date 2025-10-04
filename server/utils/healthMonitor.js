const os = require("os");
const encryptionManager = require("./encryption");
const logger = require("./logger");

class EnhancedHealthMonitor {
  constructor() {
    this.metrics = {
      // Connection metrics
      connections: {
        total: 0,
        active: 0,
        peak: 0,
        disconnections: 0,
        byType: {
          web: 0,
          mobile: 0,
          unknown: 0,
        },
      },

      // User metrics
      users: {
        totalRegistered: 0,
        activeNow: 0,
        newUsersToday: 0,
        returningUsers: 0,
      },

      // Queue metrics
      queue: {
        currentSize: 0,
        totalProcessed: 0,
        averageWaitTime: 0,
        peakSize: 0,
        matchesMade: 0,
      },

      // Performance metrics
      performance: {
        responseTimes: [],
        averageResponseTime: 0,
        requestsPerMinute: 0,
        errorRate: 0,
        uptime: 0,
      },

      // System metrics
      system: {
        memoryUsage: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        cpuUsage: {
          user: 0,
          system: 0,
          percentage: 0,
        },
        loadAverage: [0, 0, 0],
      },

      // Request metrics
      requests: {
        total: 0,
        byEndpoint: {},
        byMethod: {},
        byStatus: {},
        lastHour: [],
      },

      // Error metrics
      errors: {
        total: 0,
        byType: {},
        recent: [],
        critical: 0,
      },

      // Pairing metrics
      pairing: {
        activePairs: 0,
        totalPairsToday: 0,
        averagePairDuration: 0,
        failedPairs: 0,
      },

      // Chat metrics
      chat: {
        messagesSent: 0,
        activeConversations: 0,
        averageMessageLength: 0,
      },

      // Video metrics
      video: {
        activeCalls: 0,
        totalCallsToday: 0,
        averageCallDuration: 0,
      },
    };

    // Enhanced security tracking
    this.securityEvents = [];
    this.failedLogins = new Map();
    this.blockedIPs = new Map();
    this.suspiciousActivities = [];
    this.rateLimitCounters = new Map();

    // Active connections tracking
    this.activeSockets = new Map();
    this.activePairs = new Map();
    this.userSessions = new Map();

    // Performance tracking
    this.startTime = Date.now();
    this.requestCount = 0;
    this.lastMinuteRequests = [];
    this.errorCount = 0;

    // Initialize system monitoring
    this.initializeSystemMonitoring();

    logger.info("EnhancedHealthMonitor initialized", {
      security: "enabled",
      encryption: "enabled",
      monitoring: "comprehensive",
    });
  }

  // ===========================================================================
  // ENHANCED SECURITY MONITORING METHODS
  // ===========================================================================

  /**
   * Track security events with enhanced details
   */
  trackSecurityEvent(type, data) {
    const event = {
      eventId: encryptionManager.generateSecureToken(16),
      type,
      timestamp: Date.now(),
      severity: data.severity || "low",
      ...data,
    };

    // Add to security events
    this.securityEvents.unshift(event);

    // Keep only last 1000 events for memory management
    if (this.securityEvents.length > 1000) {
      this.securityEvents.pop();
    }

    // Log security event
    const logLevel =
      event.severity === "critical"
        ? "error"
        : event.severity === "high"
        ? "warn"
        : "info";

    logger[logLevel]("Security event tracked", {
      eventId: event.eventId,
      type: event.type,
      severity: event.severity,
      ip: event.ip,
      userId: event.userId,
      details: event,
    });

    // Track suspicious activities
    if (event.severity === "high" || event.severity === "critical") {
      this.suspiciousActivities.unshift(event);
      if (this.suspiciousActivities.length > 100) {
        this.suspiciousActivities.pop();
      }
    }

    return event.eventId;
  }

  /**
   * Track failed login attempts with IP blocking
   */
  trackFailedLogin(ip, email, reason = "Invalid credentials") {
    const key = `${ip}-${email}`;
    const now = Date.now();
    const window = 15 * 60 * 1000; // 15 minutes

    if (!this.failedLogins.has(key)) {
      this.failedLogins.set(key, []);
    }

    const attempts = this.failedLogins.get(key);
    attempts.push(now);

    // Remove attempts outside the time window
    const recentAttempts = attempts.filter((time) => now - time < window);
    this.failedLogins.set(key, recentAttempts);

    // Track the security event
    this.trackSecurityEvent("failed_login", {
      ip: ip,
      email: email,
      reason: reason,
      attempts: recentAttempts.length,
      severity: recentAttempts.length >= 3 ? "high" : "medium",
    });

    // Auto-block if too many attempts
    if (recentAttempts.length >= 5) {
      this.blockIP(
        ip,
        `Too many failed login attempts: ${recentAttempts.length} in 15 minutes`
      );
      logger.warn("IP blocked due to failed login attempts", {
        ip: ip,
        email: email,
        attempts: recentAttempts.length,
      });
    }

    return recentAttempts.length;
  }

  /**
   * Block an IP address with reason and duration
   */
  blockIP(ip, reason, durationMinutes = 60) {
    const blockInfo = {
      ip: ip,
      reason: reason,
      timestamp: Date.now(),
      blockedUntil: Date.now() + durationMinutes * 60 * 1000,
      blockedBy: "system",
    };

    this.blockedIPs.set(ip, blockInfo);

    // Track the blocking event
    this.trackSecurityEvent("ip_blocked", {
      ip: ip,
      reason: reason,
      duration: durationMinutes,
      severity: "high",
    });

    logger.warn("IP address blocked", blockInfo);

    return blockInfo;
  }

  /**
   * Check if an IP is currently blocked
   */
  isIPBlocked(ip) {
    const block = this.blockedIPs.get(ip);

    if (!block) return false;

    // Check if block has expired
    if (Date.now() >= block.blockedUntil) {
      this.blockedIPs.delete(ip);
      logger.info("IP block expired", { ip: ip });
      return false;
    }

    return true;
  }

  /**
   * Unblock an IP address
   */
  unblockIP(ip) {
    const wasBlocked = this.blockedIPs.delete(ip);

    if (wasBlocked) {
      this.trackSecurityEvent("ip_unblocked", {
        ip: ip,
        severity: "low",
      });

      logger.info("IP address unblocked", { ip: ip });
    }

    return wasBlocked;
  }

  /**
   * Get security metrics and status
   */
  getSecurityMetrics() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Count recent security events
    const recentEvents = this.securityEvents.filter(
      (event) => event.timestamp >= oneHourAgo
    );

    const highSeverityEvents = recentEvents.filter(
      (event) => event.severity === "high" || event.severity === "critical"
    );

    // Count failed logins in the last hour
    let failedLoginCount = 0;
    this.failedLogins.forEach((attempts) => {
      failedLoginCount += attempts.filter((time) => time >= oneHourAgo).length;
    });

    return {
      totalSecurityEvents: this.securityEvents.length,
      recentSecurityEvents: recentEvents.slice(0, 50), // Last 50 events
      blockedIPs: this.blockedIPs.size,
      failedLoginAttempts: failedLoginCount,
      suspiciousActivities: this.suspiciousActivities.length,
      highSeverityEvents: highSeverityEvents.length,
      securityLevel: this.calculateSecurityLevel(),
      activeThreats: highSeverityEvents.length > 0 ? "elevated" : "normal",
    };
  }

  /**
   * Calculate overall security level
   */
  calculateSecurityLevel() {
    const metrics = this.getSecurityMetrics();

    if (metrics.highSeverityEvents > 5) return "critical";
    if (metrics.highSeverityEvents > 2) return "high";
    if (metrics.failedLoginAttempts > 10) return "elevated";

    return "normal";
  }

  // ===========================================================================
  // CONNECTION AND USER TRACKING
  // ===========================================================================

  /**
   * Track new connection with enhanced details
   */
  trackConnection(socketId, connectionInfo) {
    const connection = {
      socketId: socketId,
      userId: connectionInfo.userId,
      email: connectionInfo.email,
      ip: connectionInfo.ip,
      userAgent: connectionInfo.userAgent,
      sessionId: connectionInfo.sessionId,
      connectionId: connectionInfo.connectionId,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      type: this.determineConnectionType(connectionInfo.userAgent),
    };

    this.activeSockets.set(socketId, connection);

    // Update metrics
    this.metrics.connections.active = this.activeSockets.size;
    this.metrics.connections.total++;

    if (this.metrics.connections.active > this.metrics.connections.peak) {
      this.metrics.connections.peak = this.metrics.connections.active;
    }

    this.metrics.connections.byType[connection.type]++;

    // Track user session
    this.trackUserSession(connectionInfo.userId, socketId, connectionInfo);

    logger.debug("Connection tracked", {
      socketId: socketId,
      userId: connectionInfo.userId,
      connectionType: connection.type,
    });

    return connection;
  }

  /**
   * Track user session with multiple connections
   */
  trackUserSession(userId, socketId, connectionInfo) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        userId: userId,
        email: connectionInfo.email,
        sockets: new Set(),
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        ipAddresses: new Set(),
        userAgents: new Set(),
      });
    }

    const session = this.userSessions.get(userId);
    session.sockets.add(socketId);
    session.ipAddresses.add(connectionInfo.ip);
    session.userAgents.add(connectionInfo.userAgent);
    session.lastSeen = Date.now();

    // Update active users count
    this.metrics.users.activeNow = this.userSessions.size;
  }

  /**
   * Track user login with security context
   */
  trackUserLogin(userId, loginInfo) {
    this.trackSecurityEvent("user_login", {
      userId: userId,
      email: loginInfo.email,
      ip: loginInfo.ip,
      userAgent: loginInfo.userAgent,
      sessionId: loginInfo.sessionId,
      severity: "low",
    });

    // Update user metrics
    this.metrics.users.totalRegistered++;
    this.metrics.users.newUsersToday++;
  }

  /**
   * Track disconnection with reason analysis
   */
  trackDisconnection(socketId, reason) {
    const connection = this.activeSockets.get(socketId);

    if (connection) {
      connection.disconnectedAt = Date.now();
      connection.disconnectReason = reason;
      connection.duration = Date.now() - connection.connectedAt;

      this.activeSockets.delete(socketId);

      // Update metrics
      this.metrics.connections.active = this.activeSockets.size;
      this.metrics.connections.disconnections++;

      // Clean up user session if no more connections
      if (connection.userId) {
        this.cleanupUserSession(connection.userId, socketId);
      }

      logger.debug("Disconnection tracked", {
        socketId: socketId,
        userId: connection.userId,
        reason: reason,
        duration: connection.duration,
      });
    }

    return connection;
  }

  /**
   * Clean up user session when all connections are gone
   */
  cleanupUserSession(userId, socketId) {
    const session = this.userSessions.get(userId);

    if (session) {
      session.sockets.delete(socketId);

      if (session.sockets.size === 0) {
        this.userSessions.delete(userId);
        this.metrics.users.activeNow = this.userSessions.size;
      }
    }
  }

  /**
   * Determine connection type from user agent
   */
  determineConnectionType(userAgent) {
    if (!userAgent) return "unknown";

    const agent = userAgent.toLowerCase();

    if (
      agent.includes("mobile") ||
      agent.includes("android") ||
      agent.includes("iphone")
    ) {
      return "mobile";
    } else if (agent.includes("postman") || agent.includes("curl")) {
      return "api";
    } else {
      return "web";
    }
  }

  // ===========================================================================
  // QUEUE AND PAIRING TRACKING
  // ===========================================================================

  /**
   * Track user joining queue
   */
  trackQueueJoin(userId, preferences = {}) {
    this.metrics.queue.currentSize++;

    if (this.metrics.queue.currentSize > this.metrics.queue.peakSize) {
      this.metrics.queue.peakSize = this.metrics.queue.currentSize;
    }

    this.trackSecurityEvent("queue_join", {
      userId: userId,
      preferences: preferences,
      queueSize: this.metrics.queue.currentSize,
      severity: "low",
    });

    return this.metrics.queue.currentSize;
  }

  /**
   * Track user leaving queue
   */
  trackQueueLeave(userId, reason = "manual") {
    if (this.metrics.queue.currentSize > 0) {
      this.metrics.queue.currentSize--;
    }

    this.trackSecurityEvent("queue_leave", {
      userId: userId,
      reason: reason,
      queueSize: this.metrics.queue.currentSize,
      severity: "low",
    });

    return this.metrics.queue.currentSize;
  }

  /**
   * Track successful pairing
   */
  trackPairing(user1, user2, matchType = "random") {
    const pairId = encryptionManager.generateSecureToken(16);
    const pair = {
      pairId: pairId,
      users: [user1, user2],
      matchedAt: Date.now(),
      matchType: matchType,
      active: true,
    };

    this.activePairs.set(pairId, pair);

    // Update metrics
    this.metrics.pairing.activePairs = this.activePairs.size;
    this.metrics.pairing.totalPairsToday++;
    this.metrics.queue.matchesMade++;
    this.metrics.queue.totalProcessed += 2;

    this.trackSecurityEvent("pairing_success", {
      pairId: pairId,
      user1: user1.userId,
      user2: user2.userId,
      matchType: matchType,
      severity: "low",
    });

    logger.info("Pairing tracked", {
      pairId: pairId,
      user1: user1.userId,
      user2: user2.userId,
      matchType: matchType,
    });

    return pairId;
  }

  /**
   * Track pairing end
   */
  trackPairingEnd(pairId, reason = "normal") {
    const pair = this.activePairs.get(pairId);

    if (pair) {
      pair.endedAt = Date.now();
      pair.duration = pair.endedAt - pair.matchedAt;
      pair.endReason = reason;
      pair.active = false;

      this.activePairs.delete(pairId);

      // Update metrics
      this.metrics.pairing.activePairs = this.activePairs.size;

      // Update average pair duration
      this.updateAveragePairDuration(pair.duration);

      this.trackSecurityEvent("pairing_end", {
        pairId: pairId,
        duration: pair.duration,
        reason: reason,
        severity: "low",
      });

      logger.info("Pairing ended", {
        pairId: pairId,
        duration: pair.duration,
        reason: reason,
      });
    }

    return pair;
  }

  /**
   * Update average pair duration using running average
   */
  updateAveragePairDuration(newDuration) {
    const currentAvg = this.metrics.pairing.averagePairDuration;
    const totalPairs = this.metrics.pairing.totalPairsToday;

    if (totalPairs === 1) {
      this.metrics.pairing.averagePairDuration = newDuration;
    } else {
      this.metrics.pairing.averagePairDuration =
        (currentAvg * (totalPairs - 1) + newDuration) / totalPairs;
    }
  }

  // ===========================================================================
  // PERFORMANCE AND REQUEST TRACKING
  // ===========================================================================

  /**
   * Track HTTP request with enhanced metrics
   */
  trackRequest(endpoint, method, statusCode, responseTime, ip = null) {
    const requestId = encryptionManager.generateSecureToken(16);
    const now = Date.now();

    const request = {
      requestId: requestId,
      endpoint: endpoint,
      method: method,
      statusCode: statusCode,
      responseTime: responseTime,
      timestamp: now,
      ip: ip,
    };

    // Update request count
    this.requestCount++;
    this.metrics.requests.total++;

    // Track requests per minute
    this.lastMinuteRequests.push(now);
    this.lastMinuteRequests = this.lastMinuteRequests.filter(
      (time) => now - time < 60000
    );
    this.metrics.performance.requestsPerMinute = this.lastMinuteRequests.length;

    // Track by endpoint
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = {
        count: 0,
        averageResponseTime: 0,
        errors: 0,
      };
    }
    this.metrics.requests.byEndpoint[endpoint].count++;

    // Track by method
    if (!this.metrics.requests.byMethod[method]) {
      this.metrics.requests.byMethod[method] = 0;
    }
    this.metrics.requests.byMethod[method]++;

    // Track by status code
    const statusCategory = `${Math.floor(statusCode / 100)}xx`;
    if (!this.metrics.requests.byStatus[statusCategory]) {
      this.metrics.requests.byStatus[statusCategory] = 0;
    }
    this.metrics.requests.byStatus[statusCategory]++;

    // Update response times
    this.metrics.performance.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.metrics.performance.responseTimes.length > 1000) {
      this.metrics.performance.responseTimes.shift();
    }

    // Update average response time
    this.updateAverageResponseTime(responseTime);

    // Track error rate
    if (statusCode >= 400) {
      this.trackError(new Error(`HTTP ${statusCode}`), {
        endpoint: endpoint,
        method: method,
        requestId: requestId,
      });
    }

    // Track last hour requests
    this.metrics.requests.lastHour.push(request);
    this.metrics.requests.lastHour = this.metrics.requests.lastHour.filter(
      (req) => now - req.timestamp < 3600000
    );

    return requestId;
  }

  /**
   * Update average response time using running average
   */
  updateAverageResponseTime(newResponseTime) {
    const totalRequests = this.metrics.performance.responseTimes.length;

    if (totalRequests === 1) {
      this.metrics.performance.averageResponseTime = newResponseTime;
    } else {
      const currentAvg = this.metrics.performance.averageResponseTime;
      this.metrics.performance.averageResponseTime =
        (currentAvg * (totalRequests - 1) + newResponseTime) / totalRequests;
    }
  }

  /**
   * Track response time for specific endpoint
   */
  trackResponseTime(endpoint, method, statusCode, responseTime) {
    this.trackRequest(endpoint, method, statusCode, responseTime);
  }

  /**
   * Track error with context
   */
  trackError(error, context = {}) {
    const errorId = encryptionManager.generateSecureToken(16);
    const now = Date.now();

    const errorInfo = {
      errorId: errorId,
      message: error.message,
      stack: error.stack,
      timestamp: now,
      ...context,
    };

    // Update error metrics
    this.errorCount++;
    this.metrics.errors.total++;

    const errorType = error.name || "UnknownError";
    if (!this.metrics.errors.byType[errorType]) {
      this.metrics.errors.byType[errorType] = 0;
    }
    this.metrics.errors.byType[errorType]++;

    // Track critical errors
    if (errorType === "CriticalError" || errorType === "SecurityError") {
      this.metrics.errors.critical++;
    }

    // Add to recent errors
    this.metrics.errors.recent.unshift(errorInfo);
    if (this.metrics.errors.recent.length > 50) {
      this.metrics.errors.recent.pop();
    }

    // Update error rate
    const totalRequests = this.metrics.requests.total || 1;
    this.metrics.performance.errorRate =
      (this.metrics.errors.total / totalRequests) * 100;

    // Track security event for critical errors
    if (errorType === "SecurityError" || errorType === "AuthenticationError") {
      this.trackSecurityEvent("system_error", {
        errorId: errorId,
        errorType: errorType,
        message: error.message,
        severity: "high",
      });
    }

    logger.error("Error tracked", errorInfo);

    return errorId;
  }

  // ===========================================================================
  // SYSTEM MONITORING
  // ===========================================================================

  /**
   * Initialize system monitoring
   */
  initializeSystemMonitoring() {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Update performance metrics every minute
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 60000);

    // Clean up old data every 5 minutes
    setInterval(() => {
      this.cleanupOldData();
    }, 300000);

    logger.info("System monitoring initialized");
  }

  /**
   * Update system metrics (CPU, memory, etc.)
   */
  updateSystemMetrics() {
    try {
      // Memory usage
      const memoryUsage = process.memoryUsage();
      const systemMemory = os.totalmem();
      const usedMemory = memoryUsage.heapUsed;

      this.metrics.system.memoryUsage = {
        used: usedMemory,
        total: systemMemory,
        percentage: (usedMemory / systemMemory) * 100,
      };

      // CPU usage (simplified)
      const cpus = os.cpus();
      let user = 0,
        system = 0;

      cpus.forEach((cpu) => {
        user += cpu.times.user;
        system += cpu.times.sys;
      });

      this.metrics.system.cpuUsage = {
        user: user,
        system: system,
        percentage: (user + system) / cpus.length,
      };

      // Load average
      this.metrics.system.loadAverage = os.loadavg();

      // Uptime
      this.metrics.performance.uptime = process.uptime();
    } catch (error) {
      logger.error("Error updating system metrics", { error: error.message });
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics() {
    try {
      // Calculate error rate for the last hour
      const oneHourAgo = Date.now() - 3600000;
      const recentRequests = this.metrics.requests.lastHour.filter(
        (req) => req.timestamp >= oneHourAgo
      );
      const recentErrors = recentRequests.filter(
        (req) => req.statusCode >= 400
      );

      const totalRecent = recentRequests.length || 1;
      this.metrics.performance.errorRate =
        (recentErrors.length / totalRecent) * 100;

      // Update queue metrics
      this.metrics.queue.averageWaitTime = this.calculateAverageWaitTime();
    } catch (error) {
      logger.error("Error updating performance metrics", {
        error: error.message,
      });
    }
  }

  /**
   * Calculate average wait time in queue (simplified)
   */
  calculateAverageWaitTime() {
    // This would typically come from your queue implementation
    // For now, return a simulated value based on queue size
    const baseTime = 30; // 30 seconds base
    const queueFactor = this.metrics.queue.currentSize * 5; // 5 seconds per user in queue

    return baseTime + queueFactor;
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  cleanupOldData() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Clean up old security events
    this.securityEvents = this.securityEvents.filter(
      (event) => event.timestamp >= oneDayAgo
    );

    // Clean up old failed login attempts
    this.failedLogins.forEach((attempts, key) => {
      const recentAttempts = attempts.filter((time) => time >= oneDayAgo);
      if (recentAttempts.length === 0) {
        this.failedLogins.delete(key);
      } else {
        this.failedLogins.set(key, recentAttempts);
      }
    });

    // Clean up expired IP blocks
    this.blockedIPs.forEach((block, ip) => {
      if (now >= block.blockedUntil) {
        this.blockedIPs.delete(ip);
      }
    });

    logger.debug("Old data cleanup completed", {
      securityEvents: this.securityEvents.length,
      failedLogins: this.failedLogins.size,
      blockedIPs: this.blockedIPs.size,
    });
  }

  // ===========================================================================
  // METRICS REPORTING
  // ===========================================================================

  /**
   * Get comprehensive real-time metrics
   */
  getRealTimeMetrics() {
    this.updateSystemMetrics();

    return {
      // Basic health
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),

      // Connections
      connections: {
        active: this.metrics.connections.active,
        total: this.metrics.connections.total,
        peak: this.metrics.connections.peak,
        byType: this.metrics.connections.byType,
      },

      // Users
      users: {
        active: this.metrics.users.activeNow,
        total: this.metrics.users.totalRegistered,
        newToday: this.metrics.users.newUsersToday,
      },

      // Queue
      queue: {
        current: this.metrics.queue.currentSize,
        processed: this.metrics.queue.totalProcessed,
        matches: this.metrics.queue.matchesMade,
        averageWait: this.metrics.queue.averageWaitTime,
      },

      // Performance
      performance: {
        responseTime: this.metrics.performance.averageResponseTime,
        requestsPerMinute: this.metrics.performance.requestsPerMinute,
        errorRate: this.metrics.performance.errorRate,
        uptime: this.metrics.performance.uptime,
      },

      // System
      system: {
        memory: this.metrics.system.memoryUsage,
        cpu: this.metrics.system.cpuUsage,
        load: this.metrics.system.loadAverage,
      },

      // Requests
      requests: {
        total: this.metrics.requests.total,
        byEndpoint: this.metrics.requests.byEndpoint,
        byMethod: this.metrics.requests.byMethod,
        byStatus: this.metrics.requests.byStatus,
      },

      // Errors
      errors: {
        total: this.metrics.errors.total,
        byType: this.metrics.errors.byType,
        critical: this.metrics.errors.critical,
      },

      // Pairing
      pairing: {
        active: this.metrics.pairing.activePairs,
        totalToday: this.metrics.pairing.totalPairsToday,
        averageDuration: this.metrics.pairing.averagePairDuration,
      },
    };
  }

  /**
   * Get application-specific metrics
   */
  getApplicationMetrics() {
    return {
      connections: this.metrics.connections,
      users: this.metrics.users,
      queue: this.metrics.queue,
      performance: this.metrics.performance,
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      pairing: this.metrics.pairing,
      chat: this.metrics.chat,
      video: this.metrics.video,
    };
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    this.updateSystemMetrics();
    return this.metrics.system;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.metrics.performance;
  }

  /**
   * Get error metrics
   */
  getErrorMetrics() {
    return {
      total: this.metrics.errors.total,
      byType: this.metrics.errors.byType,
      recent: this.metrics.errors.recent.slice(0, 20), // Last 20 errors
      critical: this.metrics.errors.critical,
      errorRate: this.metrics.performance.errorRate,
    };
  }

  /**
   * Get active socket connections
   */
  getActiveSockets() {
    return Array.from(this.activeSockets.values());
  }

  /**
   * Get active pairs
   */
  getActivePairs() {
    return Array.from(this.activePairs.values()).filter((pair) => pair.active);
  }

  /**
   * Get detailed queue status
   */
  getDetailedQueueStatus() {
    return {
      currentSize: this.metrics.queue.currentSize,
      activePairs: this.metrics.pairing.activePairs,
      averageWaitTime: this.metrics.queue.averageWaitTime,
      matchesToday: this.metrics.queue.matchesMade,
      totalProcessed: this.metrics.queue.totalProcessed,
      peakSize: this.metrics.queue.peakSize,
      timestamp: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // ADMIN AND MAINTENANCE METHODS
  // ===========================================================================

  /**
   * Reset all metrics (for testing/maintenance)
   */
  resetMetrics() {
    // Preserve some metrics
    const preservedMetrics = {
      connections: {
        total: this.metrics.connections.total,
        peak: this.metrics.connections.peak,
      },
      users: {
        totalRegistered: this.metrics.users.totalRegistered,
      },
      queue: {
        totalProcessed: this.metrics.queue.totalProcessed,
        matchesMade: this.metrics.queue.matchesMade,
        peakSize: this.metrics.queue.peakSize,
      },
    };

    // Reset the metrics object
    this.metrics = {
      connections: {
        ...this.metrics.connections,
        active: 0,
        disconnections: 0,
        byType: { web: 0, mobile: 0, unknown: 0 },
      },
      users: {
        ...this.metrics.users,
        activeNow: 0,
        newUsersToday: 0,
        returningUsers: 0,
      },
      queue: {
        ...this.metrics.queue,
        currentSize: 0,
        averageWaitTime: 0,
      },
      performance: {
        responseTimes: [],
        averageResponseTime: 0,
        requestsPerMinute: 0,
        errorRate: 0,
        uptime: process.uptime(),
      },
      system: this.metrics.system,
      requests: {
        total: 0,
        byEndpoint: {},
        byMethod: {},
        byStatus: {},
        lastHour: [],
      },
      errors: {
        total: 0,
        byType: {},
        recent: [],
        critical: 0,
      },
      pairing: {
        ...this.metrics.pairing,
        activePairs: 0,
        averagePairDuration: 0,
      },
      chat: {
        messagesSent: 0,
        activeConversations: 0,
        averageMessageLength: 0,
      },
      video: {
        activeCalls: 0,
        totalCallsToday: 0,
        averageCallDuration: 0,
      },
    };

    // Restore preserved metrics
    this.metrics.connections.total = preservedMetrics.connections.total;
    this.metrics.connections.peak = preservedMetrics.connections.peak;
    this.metrics.users.totalRegistered = preservedMetrics.users.totalRegistered;
    this.metrics.queue.totalProcessed = preservedMetrics.queue.totalProcessed;
    this.metrics.queue.matchesMade = preservedMetrics.queue.matchesMade;
    this.metrics.queue.peakSize = preservedMetrics.queue.peakSize;

    // Reset counters
    this.requestCount = 0;
    this.lastMinuteRequests = [];
    this.errorCount = 0;

    logger.info("Metrics reset", { preserved: preservedMetrics });
  }

  /**
   * Get health status for load balancers
   */
  getHealthStatus() {
    const metrics = this.getRealTimeMetrics();

    // Determine overall health
    let status = "healthy";
    let issues = [];

    // Check memory usage
    if (metrics.system.memory.percentage > 90) {
      status = "degraded";
      issues.push("High memory usage");
    }

    // Check error rate
    if (metrics.performance.errorRate > 10) {
      status = "degraded";
      issues.push("High error rate");
    }

    // Check active connections
    if (metrics.connections.active === 0 && metrics.uptime > 60) {
      status = "warning";
      issues.push("No active connections");
    }

    return {
      status: status,
      timestamp: metrics.timestamp,
      uptime: metrics.uptime,
      issues: issues,
      metrics: {
        memory: metrics.system.memory.percentage,
        errorRate: metrics.performance.errorRate,
        activeConnections: metrics.connections.active,
      },
    };
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    logger.info("Health monitor shutting down", {
      activeConnections: this.activeSockets.size,
      activePairs: this.activePairs.size,
      totalMetrics: this.metrics.requests.total,
    });

    // Perform final cleanup
    this.cleanupOldData();

    // Track shutdown event
    this.trackSecurityEvent("monitor_shutdown", {
      reason: "graceful",
      uptime: process.uptime(),
      severity: "low",
    });
  }
}

// Create and export singleton instance
const healthMonitor = new EnhancedHealthMonitor();
module.exports = healthMonitor;
