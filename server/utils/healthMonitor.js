const os = require("os");
const { createClient } = require("@supabase/supabase-js");

class EliteHealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      // Requests tracking
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byEndpoint: {},
        byMethod: {},
        byStatusCode: {},
        byHour: new Array(24).fill(0),
        responseTimes: [],
      },

      // User & Connection tracking
      users: {
        totalRegistered: 0,
        activeNow: 0,
        onlineNow: 0,
        sessionsToday: 0,
        newUsersToday: 0,
        geographicDistribution: {},
      },

      // Real-time connections
      connections: {
        total: 0,
        active: 0,
        peak: 0,
        socketConnections: 0,
        socketDisconnections: 0,
        byCountry: {},
        connectionDurations: [],
      },

      // Pairing system
      pairing: {
        totalPairs: 0,
        activePairs: 0,
        failedPairs: 0,
        averagePairTime: 0,
        successRate: 0,
        queueSize: 0,
        pairingHistory: [],
      },

      // Security monitoring
      security: {
        failedLogins: 0,
        blockedIPs: new Set(),
        rateLimitHits: 0,
        suspiciousActivities: 0,
        jwtRevocations: 0,
        securityEvents: [],
      },

      // Performance metrics
      performance: {
        responseTimes: [],
        memoryUsage: [],
        cpuUsage: [],
        dbQueryTimes: [],
        cacheHitRates: [],
        uptime: 0,
      },

      // Business metrics
      business: {
        activeConversations: 0,
        messagesPerMinute: 0,
        averageSessionDuration: 0,
        userRetention: 0,
        featureUsage: {},
      },

      // Error tracking
      errors: {
        total: 0,
        byType: {},
        recent: [],
        errorRate: 0,
      },
    };

    this.realTimeData = {
      activeSockets: new Map(),
      userSessions: new Map(),
      pairingSessions: new Map(),
      rateLimitTracker: new Map(),
    };

    this.setupRealTimeTracking();
    this.loadHistoricalData();
  }
  // ✅ ADD MISSING ERROR TRACKING METHOD
  trackError(error, context = {}) {
    this.metrics.errors.total++;

    const errorType = error.name || "UnknownError";
    this.metrics.errors.byType[errorType] =
      (this.metrics.errors.byType[errorType] || 0) + 1;

    this.metrics.errors.recent.unshift({
      timestamp: Date.now(),
      type: errorType,
      message: error.message,
      stack: error.stack,
      context: context,
    });

    // Keep only last 50 errors
    if (this.metrics.errors.recent.length > 50) {
      this.metrics.errors.recent.pop();
    }

    // Update error rate
    const totalRequests = this.metrics.requests.total;
    this.metrics.errors.errorRate =
      totalRequests > 0 ? (this.metrics.errors.total / totalRequests) * 100 : 0;
  }

  // ✅ ADD MISSING SYSTEM METRICS METHOD
  getSystemMetrics() {
    return {
      cpu: {
        usage: process.cpuUsage(),
        load: os.loadavg(),
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown",
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      },
      platform: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime(),
      },
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
        version: process.version,
      },
    };
  }

  // ✅ ADD MISSING ERROR METRICS METHOD
  getErrorMetrics() {
    return {
      total: this.metrics.errors.total,
      byType: { ...this.metrics.errors.byType },
      recent: this.metrics.errors.recent.slice(0, 20),
      errorRate: this.metrics.errors.errorRate,
    };
  }

  // ✅ ADD MISSING PAIRING TRACKING METHODS
  trackPairingStart(user1, user2) {
    const pairId = `${user1.userId}-${user2.userId}-${Date.now()}`;
    this.realTimeData.pairingSessions.set(pairId, {
      user1,
      user2,
      startTime: Date.now(),
      messages: 0,
      active: true,
    });

    this.metrics.pairing.activePairs++;
    this.updatePairingMetrics();

    return pairId; // Return pairId for tracking
  }

  trackPairingEnd(pairId, success = true) {
    const pairSession = this.realTimeData.pairingSessions.get(pairId);
    if (pairSession) {
      const duration = Date.now() - pairSession.startTime;

      if (success) {
        this.metrics.pairing.totalPairs++;
        this.metrics.pairing.pairingHistory.push({
          duration,
          users: [pairSession.user1.userId, pairSession.user2.userId],
          messages: pairSession.messages,
          timestamp: Date.now(),
        });
      } else {
        this.metrics.pairing.failedPairs++;
      }

      pairSession.active = false;
      this.metrics.pairing.activePairs--;
    }
    this.updatePairingMetrics();
  }

  trackMessage(pairId) {
    const pairSession = this.realTimeData.pairingSessions.get(pairId);
    if (pairSession) {
      pairSession.messages++;
      this.metrics.business.messagesPerMinute =
        this.metrics.business.messagesPerMinute * 0.9 + 1 * 0.1; // Smooth average
    }
  }

  // Real user tracking methods
  trackUserLogin(userId, userData) {
    this.metrics.users.sessionsToday++;
    this.realTimeData.userSessions.set(userId, {
      ...userData,
      loginTime: Date.now(),
      lastActivity: Date.now(),
      socketIds: new Set(),
    });
    this.updateActiveUsers();
  }

  trackUserLogout(userId) {
    this.realTimeData.userSessions.delete(userId);
    this.updateActiveUsers();
  }

  trackSocketConnection(socketId, userData) {
    this.metrics.connections.socketConnections++;
    this.metrics.connections.active++;

    this.realTimeData.activeSockets.set(socketId, {
      userId: userData.userId,
      userEmail: userData.email,
      connectTime: Date.now(),
      userAgent: userData.userAgent,
      ipAddress: userData.ip,
    });

    // Update user session with socket
    if (
      userData.userId &&
      this.realTimeData.userSessions.has(userData.userId)
    ) {
      const userSession = this.realTimeData.userSessions.get(userData.userId);
      userSession.socketIds.add(socketId);
      userSession.lastActivity = Date.now();
    }

    this.updatePeakConnections();
  }

  trackSocketDisconnection(socketId) {
    const socketData = this.realTimeData.activeSockets.get(socketId);
    if (socketData) {
      const duration = Date.now() - socketData.connectTime;
      this.metrics.connections.connectionDurations.push(duration);

      // Update user session
      if (
        socketData.userId &&
        this.realTimeData.userSessions.has(socketData.userId)
      ) {
        const userSession = this.realTimeData.userSessions.get(
          socketData.userId
        );
        userSession.socketIds.delete(socketId);
        if (userSession.socketIds.size === 0) {
          userSession.lastActivity = Date.now();
        }
      }
    }

    this.realTimeData.activeSockets.delete(socketId);
    this.metrics.connections.active = Math.max(
      0,
      this.metrics.connections.active - 1
    );
    this.metrics.connections.socketDisconnections++;
  }

  // Pairing system tracking
  trackPairingStart(user1, user2) {
    const pairId = `${user1.userId}-${user2.userId}-${Date.now()}`;
    this.realTimeData.pairingSessions.set(pairId, {
      user1,
      user2,
      startTime: Date.now(),
      messages: 0,
      active: true,
    });

    this.metrics.pairing.activePairs++;
    this.updatePairingMetrics();
  }

  trackPairingEnd(pairId, success = true) {
    const pairSession = this.realTimeData.pairingSessions.get(pairId);
    if (pairSession) {
      const duration = Date.now() - pairSession.startTime;

      if (success) {
        this.metrics.pairing.totalPairs++;
        this.metrics.pairing.pairingHistory.push({
          duration,
          users: [pairSession.user1.userId, pairSession.user2.userId],
          messages: pairSession.messages,
          timestamp: Date.now(),
        });
      } else {
        this.metrics.pairing.failedPairs++;
      }

      pairSession.active = false;
      this.metrics.pairing.activePairs--;
    }
    this.updatePairingMetrics();
  }

  trackMessage(pairId) {
    const pairSession = this.realTimeData.pairingSessions.get(pairId);
    if (pairSession) {
      pairSession.messages++;
      this.metrics.business.messagesPerMinute =
        this.metrics.business.messagesPerMinute * 0.9 + 1 * 0.1; // Smooth average
    }
  }

  // Security monitoring
  trackSecurityEvent(type, details) {
    const event = {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      severity: details.severity || "medium",
      details,
      ip: details.ip,
      userId: details.userId,
    };

    this.metrics.security.securityEvents.unshift(event);
    this.metrics.security.suspiciousActivities++;

    // Keep only last 100 events
    if (this.metrics.security.securityEvents.length > 100) {
      this.metrics.security.securityEvents.pop();
    }

    // Auto-block suspicious IPs
    if (details.ip && details.severity === "high") {
      this.metrics.security.blockedIPs.add(details.ip);
    }
  }

  trackFailedLogin(ip, email, reason) {
    this.metrics.security.failedLogins++;
    this.trackSecurityEvent("failed_login", {
      ip,
      email,
      reason,
      severity: "medium",
    });

    // Rate limiting for failed logins
    const key = `failed_login:${ip}`;
    const count = this.realTimeData.rateLimitTracker.get(key) || 0;
    this.realTimeData.rateLimitTracker.set(key, count + 1);

    if (count > 5) {
      // More than 5 failed attempts
      this.trackSecurityEvent("suspicious_activity", {
        ip,
        reason: "Multiple failed login attempts",
        severity: "high",
      });
    }
  }

  // Performance tracking
  trackResponseTime(endpoint, method, statusCode, responseTime) {
    this.metrics.requests.total++;

    if (statusCode < 400) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Track by endpoint
    this.metrics.requests.byEndpoint[endpoint] =
      (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;

    // Track by method
    this.metrics.requests.byMethod[method] =
      (this.metrics.requests.byMethod[method] || 0) + 1;

    // Track by status code
    this.metrics.requests.byStatusCode[statusCode] =
      (this.metrics.requests.byStatusCode[statusCode] || 0) + 1;

    // Track response times
    this.metrics.requests.responseTimes.push(responseTime);
    if (this.metrics.requests.responseTimes.length > 1000) {
      this.metrics.requests.responseTimes.shift();
    }

    // Track hourly distribution
    const hour = new Date().getHours();
    this.metrics.requests.byHour[hour]++;
  }

  // Real-time data methods
  updateActiveUsers() {
    this.metrics.users.activeNow = this.realTimeData.userSessions.size;
    this.metrics.users.onlineNow = Array.from(
      this.realTimeData.userSessions.values()
    ).filter((session) => session.socketIds.size > 0).length;
  }

  updatePeakConnections() {
    this.metrics.connections.peak = Math.max(
      this.metrics.connections.peak,
      this.metrics.connections.active
    );
  }

  updatePairingMetrics() {
    const totalAttempts =
      this.metrics.pairing.totalPairs + this.metrics.pairing.failedPairs;
    this.metrics.pairing.successRate =
      totalAttempts > 0
        ? (this.metrics.pairing.totalPairs / totalAttempts) * 100
        : 0;

    this.metrics.business.activeConversations =
      this.metrics.pairing.activePairs;
  }

  // Data aggregation methods
  getRealTimeMetrics() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Calculate active pairs in last hour
    const recentPairs = Array.from(
      this.realTimeData.pairingSessions.values()
    ).filter((session) => session.startTime > oneHourAgo && session.active);

    // Calculate error rate
    const totalRequests = this.metrics.requests.total;
    const failedRequests = this.metrics.requests.failed;
    this.metrics.errors.errorRate =
      totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

    return {
      timestamp: now,
      application: this.getApplicationMetrics(),
      users: this.getUserMetrics(),
      performance: this.getPerformanceMetrics(),
      security: this.getSecurityMetrics(),
      business: this.getBusinessMetrics(),
      realTime: {
        activeSockets: this.realTimeData.activeSockets.size,
        activeUsers: this.metrics.users.onlineNow,
        activePairs: this.metrics.pairing.activePairs,
        recentPairs: recentPairs.length,
        messagesLastMinute: Math.round(this.metrics.business.messagesPerMinute),
      },
    };
  }

  getApplicationMetrics() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      requests: { ...this.metrics.requests },
      connections: { ...this.metrics.connections },
      pairing: { ...this.metrics.pairing },
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || "development",
    };
  }

  getUserMetrics() {
    return {
      totalRegistered: this.metrics.users.totalRegistered,
      activeNow: this.metrics.users.activeNow,
      onlineNow: this.metrics.users.onlineNow,
      sessionsToday: this.metrics.users.sessionsToday,
      newUsersToday: this.metrics.users.newUsersToday,
      geographicDistribution: { ...this.metrics.users.geographicDistribution },
    };
  }

  getPerformanceMetrics() {
    const responseTimes = this.metrics.requests.responseTimes;
    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    return {
      responseTime: {
        average: avgResponseTime,
        p95: this.calculatePercentile(responseTimes, 95),
        p99: this.calculatePercentile(responseTimes, 99),
        max: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      },
      throughput: {
        requestsPerMinute: this.calculateRequestsPerMinute(),
        connectionsPerMinute: this.calculateConnectionsPerMinute(),
        messagesPerMinute: Math.round(this.metrics.business.messagesPerMinute),
      },
      system: {
        cpu: os.loadavg(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        },
      },
    };
  }

  getSecurityMetrics() {
    return {
      failedLogins: this.metrics.security.failedLogins,
      blockedIPs: Array.from(this.metrics.security.blockedIPs),
      rateLimitHits: this.metrics.security.rateLimitHits,
      suspiciousActivities: this.metrics.security.suspiciousActivities,
      recentEvents: this.metrics.security.securityEvents.slice(0, 20),
      jwtRevocations: this.metrics.security.jwtRevocations,
    };
  }

  getBusinessMetrics() {
    return {
      activeConversations: this.metrics.business.activeConversations,
      messagesPerMinute: Math.round(this.metrics.business.messagesPerMinute),
      averageSessionDuration: this.calculateAverageSessionDuration(),
      pairingSuccessRate: this.metrics.pairing.successRate,
      userRetention: this.metrics.business.userRetention,
      featureUsage: { ...this.metrics.business.featureUsage },
    };
  }

  // Utility methods
  calculatePercentile(arr, percentile) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  calculateRequestsPerMinute() {
    const uptimeMinutes = (Date.now() - this.startTime) / (60 * 1000);
    return uptimeMinutes > 0
      ? Math.round(this.metrics.requests.total / uptimeMinutes)
      : 0;
  }

  calculateConnectionsPerMinute() {
    const uptimeMinutes = (Date.now() - this.startTime) / (60 * 1000);
    return uptimeMinutes > 0
      ? Math.round(this.metrics.connections.total / uptimeMinutes)
      : 0;
  }

  calculateAverageSessionDuration() {
    const durations = this.metrics.connections.connectionDurations;
    return durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  setupRealTimeTracking() {
    // Update metrics every second
    setInterval(() => {
      this.updateActiveUsers();
      this.updatePairingMetrics();
    }, 1000);

    // Clean up old data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);
  }

  cleanupOldData() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Clean up old pairing sessions
    for (const [
      pairId,
      session,
    ] of this.realTimeData.pairingSessions.entries()) {
      if (!session.active && session.startTime < oneHourAgo) {
        this.realTimeData.pairingSessions.delete(pairId);
      }
    }

    // Clean up rate limit tracker
    for (const [
      key,
      timestamp,
    ] of this.realTimeData.rateLimitTracker.entries()) {
      if (timestamp < oneHourAgo) {
        this.realTimeData.rateLimitTracker.delete(key);
      }
    }
  }

  async loadHistoricalData() {
    // Load initial user count from database
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      if (!error && count) {
        this.metrics.users.totalRegistered = count;
      }
    } catch (error) {
      console.error("Error loading historical data:", error);
    }
  }

  // Admin actions
  blockIP(ip, reason = "Manual block") {
    this.metrics.security.blockedIPs.add(ip);
    this.trackSecurityEvent("ip_blocked", { ip, reason, severity: "high" });
  }

  unblockIP(ip) {
    this.metrics.security.blockedIPs.delete(ip);
  }

  resetMetrics() {
    // Reset counters but keep real-time data
    this.metrics.requests.total = 0;
    this.metrics.requests.successful = 0;
    this.metrics.requests.failed = 0;
    this.metrics.requests.byEndpoint = {};
    this.metrics.requests.byMethod = {};
    this.metrics.requests.byStatusCode = {};
    this.metrics.requests.responseTimes = [];

    this.metrics.connections.total = 0;
    this.metrics.connections.socketConnections = 0;
    this.metrics.connections.socketDisconnections = 0;
    this.metrics.connections.connectionDurations = [];

    this.metrics.security.failedLogins = 0;
    this.metrics.security.rateLimitHits = 0;
    this.metrics.security.suspiciousActivities = 0;
  }

  getActiveSockets() {
    return Array.from(this.realTimeData.activeSockets.entries()).map(
      ([socketId, data]) => ({
        socketId,
        ...data,
        duration: Date.now() - data.connectTime,
      })
    );
  }

  getActivePairs() {
    return Array.from(this.realTimeData.pairingSessions.entries())
      .filter(([_, session]) => session.active)
      .map(([pairId, session]) => ({
        pairId,
        ...session,
        duration: Date.now() - session.startTime,
      }));
  }
}

module.exports = new EliteHealthMonitor();
