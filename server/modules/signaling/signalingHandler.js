const logger = require("../../utils/logger");
const pairingManager = require("../pairing/pairingManager");

class SignalingHandler {
  constructor() {
    this.messageCounts = new Map();
    logger.info("SignalingHandler initialized");
  }

  handleSignal(socket, data) {
    try {
      logger.debug("Processing signal", {
        from: socket.id,
        to: data.to,
        signalType: data.signal?.type,
      });

      // Validate signaling data
      if (!this.validateSignalData(data)) {
        logger.warn("Invalid signal data received", {
          socketId: socket.id,
          data: this.sanitizeData(data),
        });
        return socket.emit("error", { message: "Invalid signal data" });
      }

      // Rate limit signaling messages
      if (!this.checkRateLimit(socket.id)) {
        logger.warn("Signaling rate limit exceeded", { socketId: socket.id });
        return socket.emit("error", { message: "Rate limit exceeded" });
      }

      // Check if users are paired
      const peerId = pairingManager.activePairs.get(socket.id);
      if (!peerId) {
        logger.warn("Signaling attempt without active pair", {
          socketId: socket.id,
        });
        return socket.emit("error", { message: "No active pair" });
      }

      if (peerId !== data.to) {
        logger.warn("Signaling to wrong peer", {
          socketId: socket.id,
          intendedPeer: data.to,
          actualPeer: peerId,
        });
        return socket.emit("error", { message: "Invalid peer" });
      }

      // Forward signal to peer
      const io = require("../server").io;
      io.to(peerId).emit("signal", {
        from: socket.id,
        signal: data.signal,
        type: data.type || "webrtc",
      });

      logger.debug("Signal forwarded successfully", {
        from: socket.id,
        to: peerId,
        type: data.signal.type,
      });
    } catch (error) {
      logger.error("Error handling signal", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
      socket.emit("error", { message: "Internal server error" });
    }
  }

  validateSignalData(data) {
    if (!data || typeof data !== "object") {
      return false;
    }

    if (!data.signal || typeof data.signal !== "object") {
      return false;
    }

    if (!data.to || typeof data.to !== "string") {
      return false;
    }

    // Validate SDP messages
    if (data.signal.sdp) {
      if (typeof data.signal.sdp !== "string") return false;
      if (data.signal.sdp.length > 10000) return false;
    }

    // Validate ICE candidates
    if (data.signal.candidate) {
      if (typeof data.signal.candidate !== "object") return false;
      if (!data.signal.candidate.candidate) return false;
    }

    return true;
  }

  checkRateLimit(socketId) {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    let messages = this.messageCounts.get(socketId) || [];

    // Remove old messages
    messages = messages.filter((timestamp) => timestamp > windowStart);

    // Check limit (max 50 messages per minute)
    if (messages.length >= 50) {
      return false;
    }

    // Add current message
    messages.push(now);
    this.messageCounts.set(socketId, messages);

    return true;
  }

  cleanup(socketId) {
    this.messageCounts.delete(socketId);
    logger.debug("Signaling handler cleaned up", { socketId });
  }

  sanitizeData(data) {
    // Remove large fields for logging
    const sanitized = { ...data };
    if (sanitized.signal && sanitized.signal.sdp) {
      sanitized.signal.sdp = sanitized.signal.sdp.substring(0, 100) + "...";
    }
    return sanitized;
  }
}

module.exports = new SignalingHandler();
