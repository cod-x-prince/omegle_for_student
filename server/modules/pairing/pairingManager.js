const logger = require("../../utils/logger");
const healthMonitor = require("../../utils/healthMonitor");

class PairingManager {
  constructor(io) {
    this.io = io;
    this.waitingQueue = [];
    this.activePairs = new Map();
    this.pairingTimeouts = new Map();
    this.userSockets = new Map();
    this.userJoinTimes = new Map();
    this.pairingTimeout = 30000; // 30 seconds

    logger.info("PairingManager initialized", {
      initialQueueSize: this.waitingQueue.length,
      initialPairs: this.activePairs.size,
    });

    // Start periodic queue status checks
    this.startQueueMonitoring();
  }

  // NEW: Monitor queue and provide status updates
  startQueueMonitoring() {
    setInterval(() => {
      this.checkQueueStatus();
    }, 5000); // Check every 5 seconds
  }

  // NEW: Enhanced queue status checking
  checkQueueStatus() {
    const queueSize = this.waitingQueue.length;

    logger.debug("Checking queue status", {
      queueSize: queueSize,
      activePairs: this.activePairs.size / 2,
    });

    if (queueSize === 1) {
      // Only one user in queue - notify them with helpful information
      const user = this.waitingQueue[0];
      const waitTime = Date.now() - (user.joinedAt || Date.now());

      const userSocket = this.userSockets.get(user.socketId);
      if (userSocket && userSocket.connected) {
        userSocket.emit("pairing:status", {
          message: "👋 You're the first one here!",
          queueSize: 1,
          position: 1,
          waitTime: Math.floor(waitTime / 1000),
          estimatedWait: "Waiting for another student to join...",
          suggestion: "Try inviting a friend or check back later!",
        });

        logger.info("Single user waiting for partner", {
          socketId: user.socketId,
          email: user.userData?.email,
          waitTime: `${Math.floor(waitTime / 1000)}s`,
        });
      }
    } else if (queueSize >= 2) {
      // Multiple users - attempt pairing
      this.tryPairing();
    }

    return queueSize;
  }

  addToQueue(socket, userData) {
    // Validate input
    if (!socket || !userData || !userData.email) {
      logger.error("Invalid input for addToQueue", {
        socketId: socket?.id,
        userData: userData,
      });
      return false;
    }

    // Check if user is already in queue or paired
    if (this.isUserWaiting(socket.id) || this.isUserPaired(socket.id)) {
      logger.warn("User already in queue or paired", {
        socketId: socket.id,
        email: userData.email,
        queueSize: this.waitingQueue.length,
        activePairs: this.activePairs.size / 2,
      });

      healthMonitor.trackConnection("pairing", "queue_rejected", {
        socketId: socket.id,
        reason: "already_in_queue_or_paired",
      });
      return false;
    }

    const queueItem = {
      socketId: socket.id,
      userData: userData,
      joinedAt: Date.now(),
    };

    this.waitingQueue.push(queueItem);
    this.userSockets.set(socket.id, socket);
    this.userJoinTimes.set(socket.id, Date.now());

    const queueSize = this.waitingQueue.length;
    const position =
      this.waitingQueue.findIndex((item) => item.socketId === socket.id) + 1;

    logger.info("User added to pairing queue", {
      socketId: socket.id,
      email: userData.email,
      queueSize: queueSize,
      position: position,
      totalUsers: this.userSockets.size,
    });

    healthMonitor.trackConnection("pairing", "joined_queue", {
      socketId: socket.id,
      queuePosition: position,
      queueSize: queueSize,
    });

    // Immediate status update
    socket.emit("pairing:queued", {
      position: position,
      queueSize: queueSize,
      totalUsers: queueSize,
      timestamp: Date.now(),
    });

    // Set pairing timeout (30 seconds)
    this.setPairingTimeout(socket);

    // Check if we can pair immediately
    if (queueSize >= 2) {
      this.tryPairing();
    } else {
      // Single user scenario - start timeout with better messaging
      this.handleSingleUserScenario(socket);
    }

    return true;
  }

  // NEW: Handle single user scenario with better UX
  handleSingleUserScenario(socket) {
    logger.info("Starting pairing timer for single user", {
      socketId: socket.id,
      email: socket.userData?.email,
    });

    // Clear any existing timeout
    this.clearPairingTimeout(socket.id);

    // Set timeout with periodic updates
    const timeout = setTimeout(() => {
      this.handlePairingTimeout(socket.id);
    }, this.pairingTimeout);

    this.pairingTimeouts.set(socket.id, timeout);

    // Send periodic encouragement messages
    let encouragementCount = 0;
    const encouragementMessages = [
      "🎯 Still searching... Students usually join around this time!",
      "📚 While you wait, you could prepare some study topics!",
      "👥 Try sharing CampusConnect with classmates!",
      "⏰ Peak hours are usually evenings - try again then!",
    ];

    const encouragementInterval = setInterval(() => {
      encouragementCount++;
      if (encouragementCount <= encouragementMessages.length) {
        const user = this.waitingQueue.find(
          (item) => item.socketId === socket.id
        );
        if (user && this.userSockets.get(socket.id)?.connected) {
          socket.emit("pairing:status", {
            message: encouragementMessages[encouragementCount - 1],
            queueSize: 1,
            position: 1,
            waitTime: Math.floor((Date.now() - user.joinedAt) / 1000),
            showEncouragement: true,
          });
        } else {
          clearInterval(encouragementInterval);
        }
      } else {
        clearInterval(encouragementInterval);
      }
    }, 10000); // Every 10 seconds

    // Store interval ID for cleanup
    socket.encouragementInterval = encouragementInterval;
  }

  tryPairing() {
    const queueSize = this.waitingQueue.length;

    logger.debug("Attempting to pair users", {
      queueSize: queueSize,
      availablePairs: Math.floor(queueSize / 2),
    });

    // Pair users in batches
    while (this.waitingQueue.length >= 2) {
      const user1 = this.waitingQueue.shift();
      const user2 = this.waitingQueue.shift();

      // Validate both users are still connected
      if (
        !this.isSocketConnected(user1.socketId) ||
        !this.isSocketConnected(user2.socketId)
      ) {
        logger.warn("One or both users disconnected during pairing", {
          user1: user1.socketId,
          user1Connected: this.isSocketConnected(user1.socketId),
          user2: user2.socketId,
          user2Connected: this.isSocketConnected(user2.socketId),
        });

        // Return connected users back to queue
        if (this.isSocketConnected(user1.socketId)) {
          this.waitingQueue.unshift(user1);
        }
        if (this.isSocketConnected(user2.socketId)) {
          this.waitingQueue.unshift(user2);
        }
        continue;
      }

      logger.debug("Found pair candidates", {
        user1: user1.socketId,
        user2: user2.socketId,
      });

      this.createPair(user1, user2);
    }

    // Update remaining users about their new queue position
    this.updateQueuePositions();
  }

  createPair(user1, user2) {
    try {
      logger.debug("Creating pair", {
        user1: user1.socketId,
        user2: user2.socketId,
        user1Email: user1.userData.email,
        user2Email: user2.userData.email,
      });

      // Clear timeouts and intervals
      this.clearPairingTimeout(user1.socketId);
      this.clearPairingTimeout(user2.socketId);

      // Clear encouragement intervals
      const socket1 = this.userSockets.get(user1.socketId);
      const socket2 = this.userSockets.get(user2.socketId);
      if (socket1?.encouragementInterval) {
        clearInterval(socket1.encouragementInterval);
      }
      if (socket2?.encouragementInterval) {
        clearInterval(socket2.encouragementInterval);
      }

      // Store active pair
      this.activePairs.set(user1.socketId, user2.socketId);
      this.activePairs.set(user2.socketId, user1.socketId);

      // Remove join times
      this.userJoinTimes.delete(user1.socketId);
      this.userJoinTimes.delete(user2.socketId);

      logger.info("Users paired successfully", {
        user1: {
          socketId: user1.socketId,
          email: user1.userData.email,
        },
        user2: {
          socketId: user2.socketId,
          email: user2.userData.email,
        },
        activePairs: this.activePairs.size / 2,
        waitingQueue: this.waitingQueue.length,
      });

      // Track successful pairing
      healthMonitor.trackConnection("pairing", "success", {
        user1: user1.socketId,
        user2: user2.socketId,
        user1Email: user1.userData.email,
        user2Email: user2.userData.email,
        waitingTime: Date.now() - user1.joinedAt,
      });

      // Notify both users
      this.io.to(user1.socketId).emit("paired", {
        peerId: user2.socketId,
        initiator: true,
        pairedAt: Date.now(),
        partnerEmail: user2.userData.email,
      });

      this.io.to(user2.socketId).emit("paired", {
        peerId: user1.socketId,
        initiator: false,
        pairedAt: Date.now(),
        partnerEmail: user1.userData.email,
      });

      // Also emit the new event for enhanced handling
      this.io.to(user1.socketId).emit("pairing:matched", {
        peerId: user2.socketId,
        initiator: true,
        partnerEmail: user2.userData.email,
      });

      this.io.to(user2.socketId).emit("pairing:matched", {
        peerId: user1.socketId,
        initiator: false,
        partnerEmail: user1.userData.email,
      });
    } catch (error) {
      logger.error("Error creating pair", {
        error: error.message,
        stack: error.stack,
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // Track pairing failure
      healthMonitor.trackConnection("pairing", "failure", {
        error: error.message,
        user1: user1.socketId,
        user2: user2.socketId,
      });

      healthMonitor.trackError(error, {
        context: "pairing_creation",
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // Return users to queue if they're still connected
      if (this.isSocketConnected(user1.socketId)) {
        this.waitingQueue.unshift(user1);
      }
      if (this.isSocketConnected(user2.socketId)) {
        this.waitingQueue.unshift(user2);
      }

      // Notify users of pairing error
      this.io.to(user1.socketId).emit("pairing-error", {
        message: "Failed to create pair, please try again",
      });
      this.io.to(user2.socketId).emit("pairing-error", {
        message: "Failed to create pair, please try again",
      });
    }
  }

  handleDisconnect(socketId) {
    logger.debug("Handling user disconnect", {
      socketId: socketId,
      wasInQueue: this.isUserWaiting(socketId),
      wasPaired: this.isUserPaired(socketId),
    });

    // Track disconnection
    healthMonitor.trackConnection("socket", "disconnect", {
      socketId: socketId,
      wasInQueue: this.isUserWaiting(socketId),
      wasPaired: this.isUserPaired(socketId),
    });

    this.removeFromQueue(socketId);
    this.clearPairingTimeout(socketId);
    this.userJoinTimes.delete(socketId);

    const peerId = this.activePairs.get(socketId);
    if (peerId) {
      // Notify peer about disconnection
      logger.info("Notifying peer about disconnection", {
        disconnectedUser: socketId,
        peerId: peerId,
      });

      // Track pair disconnection
      healthMonitor.trackConnection("pairing", "disconnected", {
        socketId: socketId,
        peerId: peerId,
        reason: "user_disconnected",
      });

      this.io.to(peerId).emit("peer-disconnected", {
        reason: "partner_left",
        timestamp: Date.now(),
      });

      // Clean up pair
      this.activePairs.delete(socketId);
      this.activePairs.delete(peerId);

      logger.info("Pair disconnected and cleaned up", {
        socketId: socketId,
        peerId: peerId,
        activePairs: this.activePairs.size / 2,
      });

      // Add peer back to queue if they're still connected
      const peerSocket = this.userSockets.get(peerId);
      if (peerSocket && peerSocket.connected) {
        logger.info("Adding disconnected peer back to queue", {
          peerId: peerId,
        });

        // Track peer re-queueing
        healthMonitor.trackConnection("pairing", "requeued", {
          socketId: peerId,
          reason: "partner_disconnected",
        });

        const userData = peerSocket.userData;
        this.addToQueue(peerSocket, userData);
      }
    }

    // Clean up user socket tracking
    this.userSockets.delete(socketId);

    logger.debug("Disconnect handling completed", {
      socketId: socketId,
      remainingUsers: this.userSockets.size,
    });
  }

  // Utility methods
  isUserWaiting(socketId) {
    return this.waitingQueue.some((user) => user.socketId === socketId);
  }

  isUserPaired(socketId) {
    return this.activePairs.has(socketId);
  }

  isSocketConnected(socketId) {
    const socket = this.userSockets.get(socketId);
    return socket && socket.connected;
  }

  removeFromQueue(socketId) {
    const initialLength = this.waitingQueue.length;
    this.waitingQueue = this.waitingQueue.filter(
      (user) => user.socketId !== socketId
    );

    // Clear timeout and interval for this socket
    this.clearPairingTimeout(socketId);
    const socket = this.userSockets.get(socketId);
    if (socket?.encouragementInterval) {
      clearInterval(socket.encouragementInterval);
    }

    if (this.waitingQueue.length !== initialLength) {
      logger.debug("User removed from queue", {
        socketId: socketId,
        previousQueueSize: initialLength,
        newQueueSize: this.waitingQueue.length,
      });

      // Update queue positions after removal
      this.updateQueuePositions();
    }

    return initialLength !== this.waitingQueue.length;
  }

  setPairingTimeout(socket) {
    const timeout = setTimeout(() => {
      this.handlePairingTimeout(socket.id);
    }, this.pairingTimeout);

    this.pairingTimeouts.set(socket.id, timeout);

    logger.debug("Pairing timeout set", {
      socketId: socket.id,
      timeoutMs: this.pairingTimeout,
      email: socket.userData?.email,
    });

    // Notify user about timeout
    socket.emit("pairing-timeout-set", {
      timeoutMs: this.pairingTimeout,
      startedAt: Date.now(),
    });
  }

  clearPairingTimeout(socketId) {
    const timeout = this.pairingTimeouts.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.pairingTimeouts.delete(socketId);
      logger.debug("Pairing timeout cleared", {
        socketId: socketId,
      });
    }
  }

  // UPDATED: Handle pairing timeout with better messaging
  handlePairingTimeout(socketId) {
    const wasInQueue = this.removeFromQueue(socketId);

    logger.info("Pairing timeout occurred", {
      socketId: socketId,
      wasInQueue: wasInQueue,
    });

    // Track pairing timeout
    healthMonitor.trackConnection("pairing", "timeout", {
      socketId: socketId,
      wasInQueue: wasInQueue,
      waitingTime: wasInQueue
        ? Date.now() - this.userJoinTimes.get(socketId)
        : null,
    });

    this.pairingTimeouts.delete(socketId);
    this.userSockets.delete(socketId);
    this.userJoinTimes.delete(socketId);

    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("pairing-timeout", {
        message: "No study partners available right now",
        reason: "timeout",
        waitTime: Math.floor(
          (Date.now() - this.userJoinTimes.get(socketId)) / 1000
        ),
        suggestion: "Try again during peak hours or invite friends to join!",
        retryAfter: 30000, // Suggest retry after 30 seconds
      });

      // Also emit legacy event for compatibility
      socket.emit("pairing-timeout", {
        message: "No partner found within timeout period",
        timestamp: Date.now(),
      });
    }

    logger.info("User notified of pairing timeout", {
      socketId: socketId,
      remainingQueue: this.waitingQueue.length,
    });
  }

  updateQueuePositions() {
    this.waitingQueue.forEach((user, index) => {
      const socket = this.userSockets.get(user.socketId);
      if (socket && socket.connected) {
        const position = index + 1;
        const estimatedWait = this.calculateEstimatedWait(position);

        socket.emit("queue-update", {
          position: position,
          queueSize: this.waitingQueue.length,
          estimatedWait: estimatedWait,
          waitingTime: Date.now() - user.joinedAt,
        });

        logger.debug("Queue position updated", {
          socketId: user.socketId,
          position: position,
          queueSize: this.waitingQueue.length,
          estimatedWait: estimatedWait,
        });
      }
    });
  }

  calculateEstimatedWait(position) {
    // More sophisticated wait time calculation
    if (position === 1) {
      return "Unknown - waiting for partner";
    }

    const baseWaitPerUser = 10; // seconds
    const totalWait = position * baseWaitPerUser;

    return totalWait > 60
      ? `${Math.ceil(totalWait / 60)} minutes`
      : `${totalWait} seconds`;
  }

  // NEW: Enhanced queue status method for API
  getDetailedQueueStatus() {
    return {
      waiting: this.waitingQueue.length,
      paired: this.activePairs.size / 2,
      totalUsers: this.userSockets.size,
      usersInQueue: this.waitingQueue.map((user) => ({
        email: user.userData?.email,
        socketId: user.socketId,
        joinTime: user.joinedAt,
        waitTime: Math.floor((Date.now() - user.joinedAt) / 1000),
      })),
      activePairs: Array.from(this.activePairs.entries()).reduce(
        (pairs, [key, value]) => {
          if (key < value) {
            // Avoid duplicates
            const user1Socket = this.userSockets.get(key);
            const user2Socket = this.userSockets.get(value);
            pairs.push({
              user1: key,
              user2: value,
              user1Email: user1Socket?.userData?.email || "unknown",
              user2Email: user2Socket?.userData?.email || "unknown",
            });
          }
          return pairs;
        },
        []
      ),
    };
  }

  getQueueStatus() {
    return {
      waitingUsers: this.waitingQueue.length,
      activePairs: this.activePairs.size / 2,
      totalUsers: this.userSockets.size,
      averageWaitTime: this.calculateAverageWaitTime(),
      queue: this.waitingQueue.map((user) => ({
        socketId: user.socketId,
        email: user.userData.email,
        waitingTime: Date.now() - user.joinedAt,
        joinedAt: user.joinedAt,
      })),
      activePairsList: Array.from(this.activePairs.entries()).reduce(
        (pairs, [key, value]) => {
          if (key < value) {
            // Avoid duplicates
            const user1Socket = this.userSockets.get(key);
            const user2Socket = this.userSockets.get(value);

            pairs.push({
              user1: key,
              user2: value,
              user1Email: user1Socket?.userData?.email || "unknown",
              user2Email: user2Socket?.userData?.email || "unknown",
            });
          }
          return pairs;
        },
        []
      ),
    };
  }

  calculateAverageWaitTime() {
    if (this.waitingQueue.length === 0) return 0;

    const totalWaitTime = this.waitingQueue.reduce((total, user) => {
      return total + (Date.now() - user.joinedAt);
    }, 0);

    return Math.round(totalWaitTime / this.waitingQueue.length / 1000); // in seconds
  }

  // Method to manually remove user (for admin purposes)
  removeUser(socketId) {
    logger.warn("Manual user removal requested", { socketId: socketId });
    this.handleDisconnect(socketId);
  }

  // Get user statistics
  getUserStats(socketId) {
    const inQueue = this.isUserWaiting(socketId);
    const pairedWith = this.activePairs.get(socketId);

    return {
      inQueue: inQueue,
      queuePosition: inQueue
        ? this.waitingQueue.findIndex((user) => user.socketId === socketId) + 1
        : null,
      pairedWith: pairedWith,
      isPaired: !!pairedWith,
      waitingTime: inQueue
        ? Date.now() -
          this.waitingQueue.find((user) => user.socketId === socketId).joinedAt
        : null,
      totalQueueSize: this.waitingQueue.length,
      activePairsCount: this.activePairs.size / 2,
    };
  }

  // Clean up method for orphaned users
  cleanupOrphanedUsers() {
    const now = Date.now();
    const orphanTimeout = 5 * 60 * 1000; // 5 minutes

    let cleanedCount = 0;

    // Clean orphaned queue users
    this.waitingQueue = this.waitingQueue.filter((user) => {
      const socket = this.userSockets.get(user.socketId);
      const isOrphaned =
        !socket || !socket.connected || now - user.joinedAt > orphanTimeout;

      if (isOrphaned) {
        logger.warn("Cleaning orphaned queue user", {
          socketId: user.socketId,
          joinedAt: user.joinedAt,
          waitingTime: now - user.joinedAt,
        });

        this.clearPairingTimeout(user.socketId);
        this.userSockets.delete(user.socketId);
        this.userJoinTimes.delete(user.socketId);
        cleanedCount++;
        return false;
      }
      return true;
    });

    // Clean orphaned pairs
    const pairsToRemove = [];
    this.activePairs.forEach((peerId, socketId) => {
      const socket = this.userSockets.get(socketId);
      if (!socket || !socket.connected) {
        pairsToRemove.push(socketId);
      }
    });

    pairsToRemove.forEach((socketId) => {
      this.handleDisconnect(socketId);
      cleanedCount++;
    });

    if (cleanedCount > 0) {
      logger.info("Cleanup completed", {
        orphanedUsersRemoved: cleanedCount,
        remainingQueue: this.waitingQueue.length,
        remainingPairs: this.activePairs.size / 2,
      });
    }

    return cleanedCount;
  }

  // Emergency reset method
  emergencyReset() {
    logger.warn("EMERGENCY RESET INITIATED", {
      queueSize: this.waitingQueue.length,
      activePairs: this.activePairs.size / 2,
      totalUsers: this.userSockets.size,
    });

    // Clear all timeouts and intervals
    this.pairingTimeouts.forEach((timeout, socketId) => {
      clearTimeout(timeout);
    });

    // Clear all encouragement intervals
    this.userSockets.forEach((socket) => {
      if (socket.encouragementInterval) {
        clearInterval(socket.encouragementInterval);
      }
    });

    // Notify all users
    this.waitingQueue.forEach((user) => {
      const socket = this.userSockets.get(user.socketId);
      if (socket) {
        socket.emit("system-reset", {
          message: "System reset initiated",
          timestamp: Date.now(),
        });
      }
    });

    // Reset all state
    this.waitingQueue = [];
    this.activePairs.clear();
    this.pairingTimeouts.clear();
    this.userSockets.clear();
    this.userJoinTimes.clear();

    logger.warn("EMERGENCY RESET COMPLETED");
  }
}

module.exports = PairingManager;
