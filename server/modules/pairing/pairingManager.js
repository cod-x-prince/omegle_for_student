const logger = require("../../utils/logger");
const healthMonitor = require("../../utils/healthMonitor"); // ✅ Add health monitor

class PairingManager {
  constructor(io) {
    this.io = io;
    this.waitingQueue = [];
    this.activePairs = new Map();
    this.pairingTimeouts = new Map();
    this.userSockets = new Map(); // Track socket by user ID

    logger.info("PairingManager initialized", {
      initialQueueSize: this.waitingQueue.length,
      initialPairs: this.activePairs.size,
    });
  }

  addToQueue(socket, userData) {
    // Check if user is already in queue or paired
    if (this.isUserWaiting(socket.id) || this.isUserPaired(socket.id)) {
      logger.warn("User already in queue or paired", {
        socketId: socket.id,
        email: userData.email,
        queueSize: this.waitingQueue.length,
        activePairs: this.activePairs.size / 2,
      });

      // ✅ Track failed queue addition
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

    logger.info("User added to pairing queue", {
      socketId: socket.id,
      email: userData.email,
      queueSize: this.waitingQueue.length,
      position: this.waitingQueue.length,
      totalUsers: this.userSockets.size,
    });

    // ✅ Track successful queue addition
    healthMonitor.trackConnection("pairing", "joined_queue", {
      socketId: socket.id,
      queuePosition: this.waitingQueue.length,
      queueSize: this.waitingQueue.length,
    });

    // Set pairing timeout (30 seconds)
    this.setPairingTimeout(socket);

    // Try to pair immediately if possible
    this.tryPairing();

    // Notify user of queue position
    socket.emit("queue-update", {
      position: this.waitingQueue.length,
      queueSize: this.waitingQueue.length,
      estimatedWait: this.waitingQueue.length * 10, // Rough estimate
    });

    return true;
  }

  tryPairing() {
    const queueSize = this.waitingQueue.length;

    logger.debug("Attempting to pair users", {
      queueSize: queueSize,
      availablePairs: Math.floor(queueSize / 2),
    });

    while (this.waitingQueue.length >= 2) {
      const user1 = this.waitingQueue.shift();
      const user2 = this.waitingQueue.shift();

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

      // Clear timeouts
      this.clearPairingTimeout(user1.socketId);
      this.clearPairingTimeout(user2.socketId);

      // Store active pair
      this.activePairs.set(user1.socketId, user2.socketId);
      this.activePairs.set(user2.socketId, user1.socketId);

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

      // ✅ Track successful pairing
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
      });

      this.io.to(user2.socketId).emit("paired", {
        peerId: user1.socketId,
        initiator: false,
        pairedAt: Date.now(),
      });
    } catch (error) {
      logger.error("Error creating pair", {
        error: error.message,
        stack: error.stack,
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // ✅ Track pairing failure
      healthMonitor.trackConnection("pairing", "failure", {
        error: error.message,
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // ✅ Track the error
      healthMonitor.trackError(error, {
        context: "pairing_creation",
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // Return users to queue
      this.waitingQueue.unshift(user1, user2);

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

    // ✅ Track disconnection
    healthMonitor.trackConnection("socket", "disconnect", {
      socketId: socketId,
      wasInQueue: this.isUserWaiting(socketId),
      wasPaired: this.isUserPaired(socketId),
    });

    this.removeFromQueue(socketId);
    this.clearPairingTimeout(socketId);

    const peerId = this.activePairs.get(socketId);
    if (peerId) {
      // Notify peer about disconnection
      logger.info("Notifying peer about disconnection", {
        disconnectedUser: socketId,
        peerId: peerId,
      });

      // ✅ Track pair disconnection
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

        // ✅ Track peer re-queueing
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

  removeFromQueue(socketId) {
    const initialLength = this.waitingQueue.length;
    this.waitingQueue = this.waitingQueue.filter(
      (user) => user.socketId !== socketId
    );

    if (this.waitingQueue.length !== initialLength) {
      logger.debug("User removed from queue", {
        socketId: socketId,
        previousQueueSize: initialLength,
        newQueueSize: this.waitingQueue.length,
      });
    }
  }

  setPairingTimeout(socket) {
    const timeout = setTimeout(() => {
      this.handlePairingTimeout(socket.id);
    }, 30000); // 30 seconds

    this.pairingTimeouts.set(socket.id, timeout);

    logger.debug("Pairing timeout set", {
      socketId: socket.id,
      timeoutMs: 30000,
      email: socket.userData?.email,
    });

    // Notify user about timeout
    socket.emit("pairing-timeout-set", {
      timeoutMs: 30000,
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

  handlePairingTimeout(socketId) {
    logger.info("Pairing timeout occurred", {
      socketId: socketId,
      wasInQueue: this.isUserWaiting(socketId),
    });

    // ✅ Track pairing timeout
    healthMonitor.trackConnection("pairing", "timeout", {
      socketId: socketId,
      wasInQueue: this.isUserWaiting(socketId),
      waitingTime: this.isUserWaiting(socketId)
        ? Date.now() -
          this.waitingQueue.find((user) => user.socketId === socketId)?.joinedAt
        : null,
    });

    this.removeFromQueue(socketId);
    this.pairingTimeouts.delete(socketId);
    this.userSockets.delete(socketId);

    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
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
        socket.emit("queue-update", {
          position: index + 1,
          queueSize: this.waitingQueue.length,
          estimatedWait: (index + 1) * 10,
        });
      }
    });
  }

  getQueueStatus() {
    return {
      waitingUsers: this.waitingQueue.length,
      activePairs: this.activePairs.size / 2,
      totalUsers: this.userSockets.size,
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
            pairs.push({ user1: key, user2: value });
          }
          return pairs;
        },
        []
      ),
    };
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
    };
  }
}

module.exports = PairingManager;
