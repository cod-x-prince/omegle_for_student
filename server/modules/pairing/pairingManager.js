const logger = require("../../utils/logger");

class PairingManager {
  constructor(io) {
    this.io = io;
    this.waitingQueue = [];
    this.activePairs = new Map();
    this.pairingTimeouts = new Map();

    logger.info("PairingManager initialized");
  }

  addToQueue(socket, userData) {
    // Check if user is already in queue or paired
    if (this.isUserWaiting(socket.id) || this.isUserPaired(socket.id)) {
      logger.warn("User already in queue or paired", {
        socketId: socket.id,
        queueSize: this.waitingQueue.length,
      });
      return false;
    }

    const queueItem = {
      socketId: socket.id,
      userData: userData,
      joinedAt: Date.now(),
    };

    this.waitingQueue.push(queueItem);

    logger.info("User added to pairing queue", {
      socketId: socket.id,
      email: userData.email,
      queueSize: this.waitingQueue.length,
      position: this.waitingQueue.length,
    });

    // Set pairing timeout (30 seconds)
    this.setPairingTimeout(socket);

    // Try to pair immediately if possible
    this.tryPairing();

    return true;
  }

  tryPairing() {
    logger.debug("Attempting to pair users", {
      queueSize: this.waitingQueue.length,
    });

    while (this.waitingQueue.length >= 2) {
      const user1 = this.waitingQueue.shift();
      const user2 = this.waitingQueue.shift();

      this.createPair(user1, user2);
    }
  }

  createPair(user1, user2) {
    try {
      logger.debug("Creating pair", {
        user1: user1.socketId,
        user2: user2.socketId,
      });

      // Clear timeouts
      this.clearPairingTimeout(user1.socketId);
      this.clearPairingTimeout(user2.socketId);

      // Store active pair
      this.activePairs.set(user1.socketId, user2.socketId);
      this.activePairs.set(user2.socketId, user1.socketId);

      logger.info("Users paired successfully", {
        user1: { socketId: user1.socketId, email: user1.userData.email },
        user2: { socketId: user2.socketId, email: user2.userData.email },
        activePairs: this.activePairs.size / 2,
      });

      // Notify both users
      const io = require("../server").io;

      this.io.to(user1.socketId).emit("paired", {
        peerId: user2.socketId,
        initiator: true,
      });

      this.io.to(user2.socketId).emit("paired", {
        peerId: user1.socketId,
        initiator: false,
      });
    } catch (error) {
      logger.error("Error creating pair", {
        error: error.message,
        stack: error.stack,
      });

      // Return users to queue
      this.waitingQueue.unshift(user1, user2);
    }
  }

  handleDisconnect(socketId) {
    logger.debug("Handling user disconnect", { socketId });

    this.removeFromQueue(socketId);
    this.clearPairingTimeout(socketId);

    const peerId = this.activePairs.get(socketId);
    if (peerId) {
      // Notify peer about disconnection
      this.io.to(peerId).emit("peer-disconnected");

      // Clean up pair
      this.activePairs.delete(socketId);
      this.activePairs.delete(peerId);

      logger.info("Pair disconnected and cleaned up", {
        socketId,
        peerId,
        activePairs: this.activePairs.size / 2,
      });
    } else {
      logger.debug("User was not in an active pair", { socketId });
    }
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
        socketId,
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
    });
  }

  clearPairingTimeout(socketId) {
    const timeout = this.pairingTimeouts.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.pairingTimeouts.delete(socketId);
      logger.debug("Pairing timeout cleared", { socketId });
    }
  }

  handlePairingTimeout(socketId) {
    logger.info("Pairing timeout occurred", { socketId });

    this.removeFromQueue(socketId);
    this.pairingTimeouts.delete(socketId);

    this.io.to(socketId).emit("pairing-timeout");

    logger.info("User notified of pairing timeout", { socketId });
  }

  getQueueStatus() {
    return {
      waitingUsers: this.waitingQueue.length,
      activePairs: this.activePairs.size / 2,
      queue: this.waitingQueue.map((user) => ({
        socketId: user.socketId,
        email: user.userData.email,
        waitingTime: Date.now() - user.joinedAt,
      })),
    };
  }
}

module.exports = PairingManager;
