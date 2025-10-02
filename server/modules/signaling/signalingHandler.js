const logger = require("../../utils/logger"); // ✅ Correct path

class SignalingHandler {
  constructor(io, pairingManager) {
    this.io = io;
    this.pairingManager = pairingManager;
    this.messageCounts = new Map();
    this.rateLimitWindow = 60000;
    this.rateLimitMax = 50;

    logger.info("SignalingHandler initialized", {
      rateLimitWindow: this.rateLimitWindow,
      rateLimitMax: this.rateLimitMax,
    });
  }

  handleSignal(socket, data) {
    const startTime = Date.now();

    try {
      logger.debug("Processing signal", {
        from: socket.id,
        to: data.to,
        signalType: data.signal?.type,
        timestamp: startTime,
      });

      // Validate signaling data
      if (!this.validateSignalData(data)) {
        logger.warn("Invalid signal data received", {
          socketId: socket.id,
          data: this.sanitizeData(data),
          email: socket.userData?.email,
        });
        socket.emit("error", {
          message: "Invalid signal data",
          code: "INVALID_SIGNAL",
        });
        return;
      }

      // Rate limit signaling messages
      if (!this.checkRateLimit(socket.id)) {
        logger.warn("Signaling rate limit exceeded", {
          socketId: socket.id,
          email: socket.userData?.email,
        });
        socket.emit("error", {
          message: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
        });
        return;
      }

      // Check if users are paired using the pairingManager instance
      const peerId = this.pairingManager.activePairs.get(socket.id);

      if (!peerId) {
        logger.warn("Signaling attempt without active pair", {
          socketId: socket.id,
          email: socket.userData?.email,
          targetPeer: data.to,
        });
        socket.emit("error", {
          message: "No active pair",
          code: "NO_ACTIVE_PAIR",
        });
        return;
      }

      if (peerId !== data.to) {
        logger.warn("Signaling to wrong peer", {
          socketId: socket.id,
          intendedPeer: data.to,
          actualPeer: peerId,
          email: socket.userData?.email,
        });
        socket.emit("error", {
          message: "Invalid peer",
          code: "INVALID_PEER",
        });
        return;
      }

      // Check if peer is still connected
      const peerSocket = this.io.sockets.sockets.get(peerId);
      if (!peerSocket || !peerSocket.connected) {
        logger.warn("Signaling to disconnected peer", {
          socketId: socket.id,
          peerId: peerId,
        });
        socket.emit("error", {
          message: "Peer disconnected",
          code: "PEER_DISCONNECTED",
        });
        return;
      }

      // Forward signal to peer
      this.io.to(peerId).emit("signal", {
        from: socket.id,
        signal: data.signal,
        type: data.type || "webrtc",
        timestamp: Date.now(),
      });

      const processingTime = Date.now() - startTime;

      logger.debug("Signal forwarded successfully", {
        from: socket.id,
        to: peerId,
        type: data.signal.type,
        processingTime: processingTime,
      });
    } catch (error) {
      logger.error("Error handling signal", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
        processingTime: Date.now() - startTime,
      });
      socket.emit("error", {
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
  }

  validateSignalData(data) {
    if (!data || typeof data !== "object") {
      logger.debug("Signal data validation failed: not an object");
      return false;
    }

    if (!data.signal || typeof data.signal !== "object") {
      logger.debug(
        "Signal data validation failed: missing or invalid signal object"
      );
      return false;
    }

    if (!data.to || typeof data.to !== "string") {
      logger.debug(
        "Signal data validation failed: missing or invalid 'to' field"
      );
      return false;
    }

    // Validate signal type
    if (!data.signal.type || typeof data.signal.type !== "string") {
      logger.debug(
        "Signal data validation failed: missing or invalid signal type"
      );
      return false;
    }

    const validSignalTypes = ["offer", "answer", "ice-candidate", "candidate"];
    if (!validSignalTypes.includes(data.signal.type)) {
      logger.debug("Signal data validation failed: invalid signal type", {
        type: data.signal.type,
      });
      return false;
    }

    // Validate SDP messages
    if (data.signal.sdp) {
      if (typeof data.signal.sdp !== "string") {
        logger.debug("Signal data validation failed: SDP not a string");
        return false;
      }
      if (data.signal.sdp.length > 10000) {
        logger.debug("Signal data validation failed: SDP too long", {
          length: data.signal.sdp.length,
        });
        return false;
      }
    }

    // Validate ICE candidates
    if (data.signal.candidate) {
      if (typeof data.signal.candidate !== "object") {
        logger.debug("Signal data validation failed: candidate not an object");
        return false;
      }
      if (!data.signal.candidate.candidate) {
        logger.debug("Signal data validation failed: missing candidate string");
        return false;
      }
      if (data.signal.candidate.candidate.length > 1000) {
        logger.debug("Signal data validation failed: candidate too long");
        return false;
      }
    }

    return true;
  }

  checkRateLimit(socketId) {
    const now = Date.now();
    const windowStart = now - this.rateLimitWindow;

    let messages = this.messageCounts.get(socketId) || [];

    // Remove old messages outside the current window
    messages = messages.filter((timestamp) => timestamp > windowStart);

    // Check limit
    if (messages.length >= this.rateLimitMax) {
      logger.debug("Rate limit exceeded for socket", {
        socketId: socketId,
        messageCount: messages.length,
        limit: this.rateLimitMax,
      });
      return false;
    }

    // Add current message timestamp
    messages.push(now);
    this.messageCounts.set(socketId, messages);

    return true;
  }

  cleanup(socketId) {
    const messageCount = this.messageCounts.get(socketId)?.length || 0;
    this.messageCounts.delete(socketId);

    logger.debug("Signaling handler cleaned up", {
      socketId: socketId,
      clearedMessages: messageCount,
    });
  }

  sanitizeData(data) {
    // Remove large fields for logging
    const sanitized = { ...data };

    if (sanitized.signal) {
      if (sanitized.signal.sdp) {
        sanitized.signal.sdp = sanitized.signal.sdp.substring(0, 100) + "...";
      }
      if (sanitized.signal.candidate && sanitized.signal.candidate.candidate) {
        sanitized.signal.candidate.candidate =
          sanitized.signal.candidate.candidate.substring(0, 50) + "...";
      }
    }

    return sanitized;
  }

  // Get statistics for monitoring
  getStats() {
    const totalSockets = this.messageCounts.size;
    const totalMessages = Array.from(this.messageCounts.values()).reduce(
      (sum, messages) => sum + messages.length,
      0
    );

    return {
      totalSockets: totalSockets,
      totalMessages: totalMessages,
      rateLimitWindow: this.rateLimitWindow,
      rateLimitMax: this.rateLimitMax,
    };
  }

  // Reset rate limiting for a specific socket (for testing/admin)
  resetRateLimit(socketId) {
    const hadEntries = this.messageCounts.has(socketId);
    this.messageCounts.delete(socketId);

    logger.info("Rate limit reset for socket", {
      socketId: socketId,
      hadEntries: hadEntries,
    });

    return hadEntries;
  }
}

module.exports = SignalingHandler; // Export class, not instance
