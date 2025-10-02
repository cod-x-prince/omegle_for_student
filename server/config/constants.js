// Application constants
module.exports = {
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  // Email domains
  ALLOWED_DOMAINS: [".edu", "@cmrit.ac.in"],

  // Security settings
  MAX_CONNECTIONS_PER_IP: 5,
  SESSION_TIMEOUT: 3600000, // 1 hour
  PAIRING_TIMEOUT: 30000, // 30 seconds

  // WebRTC settings
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  // Signaling message types
  SIGNAL_TYPES: {
    OFFER: "offer",
    ANSWER: "answer",
    ICE_CANDIDATE: "ice-candidate",
    CHAT_MESSAGE: "chat-message", // Future feature
  },

  // Error messages
  ERRORS: {
    INVALID_EMAIL: "Invalid college email address",
    RATE_LIMITED: "Too many requests",
    UNAUTHORIZED: "Authentication required",
    PAIRING_TIMEOUT: "Pairing timeout occurred",
  },
};
