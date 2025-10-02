const jwt = require("jsonwebtoken");
const logger = require("../../utils/logger");  // ✅ Correct path

class AuthMiddleware {
  constructor() {
    this.authenticateToken = this.authenticateToken.bind(this);
    this.validateEmail = this.validateEmail.bind(this);
    this.jwtSecret =
      process.env.JWT_SECRET || "fallback-secret-for-development";

    logger.info("AuthMiddleware initialized", {
      hasJwtSecret: !!process.env.JWT_SECRET,
      environment: process.env.NODE_ENV || "development",
    });
  }

  // Token authentication for socket connections
  authenticateToken(socket, next) {
    const startTime = Date.now();

    try {
      logger.debug("Authenticating socket connection", {
        socketId: socket.id,
        handshake: socket.handshake.auth,
        headers: socket.handshake.headers,
        address: socket.handshake.address,
      });

      const token = socket.handshake.auth.token;

      if (!token) {
        logger.warn("Authentication attempt without token", {
          socketId: socket.id,
          ip: socket.handshake.address,
          userAgent: socket.handshake.headers["user-agent"],
        });
        return next(new Error("Authentication token required"));
      }

      let userData;

      // Try JWT verification first
      try {
        userData = jwt.verify(token, this.jwtSecret);
        logger.debug("JWT token verified successfully", {
          socketId: socket.id,
          userId: userData.userId,
          email: userData.email,
        });
      } catch (jwtError) {
        logger.warn("JWT verification failed, falling back to simple token", {
          socketId: socket.id,
          jwtError: jwtError.message,
        });

        // Fallback to simple token parsing for development
        userData = this.parseSimpleToken(token);
      }

      if (!userData || !userData.email) {
        logger.warn("Invalid token format - missing user data", {
          socketId: socket.id,
          tokenPreview: token.substring(0, 20) + "...",
        });
        return next(new Error("Invalid token format"));
      }

      // Validate email domain
      if (!this.validateEmail(userData.email)) {
        logger.warn("Invalid email domain in token", {
          socketId: socket.id,
          email: userData.email,
        });
        return next(new Error("Invalid email domain"));
      }

      socket.userData = {
        email: userData.email,
        userId: userData.userId || this.generateUserId(userData.email),
        socketId: socket.id,
        authenticated: true,
        authMethod: userData.userId ? "jwt" : "simple",
      };

      const authTime = Date.now() - startTime;

      logger.info("Socket authentication successful", {
        socketId: socket.id,
        email: userData.email,
        userId: socket.userData.userId,
        authMethod: socket.userData.authMethod,
        authTime: authTime,
      });

      next();
    } catch (error) {
      const authTime = Date.now() - startTime;

      logger.error("Socket authentication failed", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
        authTime: authTime,
      });
      next(new Error("Authentication failed"));
    }
  }

  // Parse simple token (for development/fallback)
  parseSimpleToken(token) {
    try {
      // Simple token format: "dev_token_TIMESTAMP_EMAIL"
      if (token.startsWith("dev_token_")) {
        const parts = token.split("_");
        if (parts.length >= 4) {
          const email = parts.slice(3).join("_"); // In case email contains underscores
          return {
            email: email,
            timestamp: parseInt(parts[2]),
          };
        }
      }

      // If it's just an email (legacy support)
      if (token.includes("@")) {
        return { email: token };
      }

      return null;
    } catch (error) {
      logger.warn("Error parsing simple token", {
        error: error.message,
        tokenPreview: token.substring(0, 20) + "...",
      });
      return null;
    }
  }

  // Email validation
  validateEmail(email) {
    if (!email || typeof email !== "string") {
      logger.debug("Email validation failed: missing or invalid type", {
        email,
      });
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.debug("Email validation failed: invalid format", { email });
      return false;
    }

    const allowedDomains = [".edu", "@cmrit.ac.in"];
    const isValidDomain = allowedDomains.some((domain) =>
      email.toLowerCase().endsWith(domain.toLowerCase())
    );

    if (!isValidDomain) {
      logger.debug("Email validation failed: domain not allowed", { email });
      return false;
    }

    logger.debug("Email validation successful", { email });
    return true;
  }

  // Generate user ID from email
  generateUserId(email) {
    try {
      const userId = Buffer.from(email)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "");

      logger.debug("Generated user ID", { email, userId });
      return userId;
    } catch (error) {
      logger.error("Error generating user ID", { email, error: error.message });
      return `user_${Date.now()}`;
    }
  }

  // Generate JWT token
  generateJWTToken(user) {
    try {
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
        },
        this.jwtSecret,
        { expiresIn: "1h" }
      );

      logger.debug("JWT token generated", {
        userId: user.id,
        email: user.email,
      });

      return token;
    } catch (error) {
      logger.error("Error generating JWT token", {
        userId: user.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Generate simple token (for development)
  generateSimpleToken(email) {
    const token = `dev_token_${Date.now()}_${email}`;

    logger.debug("Simple token generated", {
      email: email,
      tokenPreview: token.substring(0, 20) + "...",
    });

    return token;
  }

  // Validate token (for HTTP routes)
  validateHttpToken(token) {
    try {
      if (!token) {
        return { valid: false, error: "No token provided" };
      }

      // Try JWT first
      try {
        const decoded = jwt.verify(token, this.jwtSecret);
        return { valid: true, user: decoded };
      } catch (jwtError) {
        // Fallback to simple token
        const userData = this.parseSimpleToken(token);
        if (userData && userData.email) {
          return { valid: true, user: userData };
        }

        return { valid: false, error: "Invalid token" };
      }
    } catch (error) {
      logger.error("Error validating HTTP token", { error: error.message });
      return { valid: false, error: "Token validation error" };
    }
  }

  // Get authentication statistics
  getAuthStats() {
    return {
      jwtSecretConfigured: !!process.env.JWT_SECRET,
      environment: process.env.NODE_ENV || "development",
      allowedDomains: [".edu", "@cmrit.ac.in"],
    };
  }
}

module.exports = new AuthMiddleware();
