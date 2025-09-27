const logger = require("../../utils/logger");

class AuthMiddleware {
  constructor() {
    this.authenticateToken = this.authenticateToken.bind(this);
    this.validateEmail = this.validateEmail.bind(this);
  }

  // Simplified token authentication for now
  authenticateToken(socket, next) {
    try {
      logger.debug("Authenticating socket connection", {
        socketId: socket.id,
        handshake: socket.handshake.auth,
      });

      const token = socket.handshake.auth.token;

      if (!token) {
        logger.warn("Authentication attempt without token", {
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        return next(new Error("Authentication token required"));
      }

      // TODO: Implement proper JWT validation
      // For now, we'll accept any token and extract email from it
      let email = "unknown@example.edu";

      try {
        // Simple token parsing (replace with JWT later)
        if (token.includes("@")) {
          email = token;
        }
      } catch (error) {
        logger.warn("Invalid token format", {
          socketId: socket.id,
          token: token.substring(0, 10) + "...", // Log only first 10 chars
        });
      }

      socket.userData = {
        email: email,
        userId: this.generateUserId(email),
        socketId: socket.id,
        authenticated: true,
      };

      logger.info("Socket authentication successful", {
        socketId: socket.id,
        email: email,
      });

      next();
    } catch (error) {
      logger.error("Socket authentication failed", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
      next(new Error("Authentication failed"));
    }
  }

  // Email validation
  validateEmail(email) {
    if (!email || typeof email !== "string") {
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }

    const allowedDomains = [".edu", "@cmrit.ac.in"];
    return allowedDomains.some((domain) =>
      email.toLowerCase().endsWith(domain.toLowerCase())
    );
  }

  // Generate user ID from email
  generateUserId(email) {
    return Buffer.from(email)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  // Generate simple token (for development)
  generateSimpleToken(email) {
    return `dev_token_${Date.now()}_${email}`;
  }
}

module.exports = new AuthMiddleware();
