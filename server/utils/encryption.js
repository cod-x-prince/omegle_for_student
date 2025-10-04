const crypto = require("crypto");
const logger = require("./logger");

class EncryptionManager {
  constructor() {
    this.algorithm = "aes-256-gcm";
    this.keyLength = 32;
    this.ivLength = 16;
    this.authTagLength = 16;
  }

  // Generate encryption key for a session
  generateSessionKey() {
    return crypto.randomBytes(this.keyLength);
  }

  // Derive key from password (for key exchange)
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, "sha256");
  }

  // Encrypt message with session key
  encryptMessage(message, key) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key);

      let encrypted = cipher.update(message, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      return {
        iv: iv.toString("hex"),
        content: encrypted,
        authTag: authTag.toString("hex"),
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("Encryption failed", { error: error.message });
      throw new Error("Message encryption failed");
    }
  }

  // Decrypt message with session key
  decryptMessage(encryptedData, key) {
    try {
      const decipher = crypto.createDecipher(this.algorithm, key);

      decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));

      let decrypted = decipher.update(encryptedData.content, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("Decryption failed", {
        error: error.message,
        hasAuthTag: !!encryptedData.authTag,
      });
      throw new Error("Message decryption failed - possible tampering");
    }
  }

  // Generate key pair for Diffie-Hellman key exchange
  generateKeyPair() {
    const dh = crypto.createDiffieHellman(256);
    const publicKey = dh.generateKeys();
    const privateKey = dh.getPrivateKey();

    return {
      publicKey: publicKey.toString("hex"),
      privateKey: privateKey.toString("hex"),
    };
  }

  // Compute shared secret
  computeSharedSecret(privateKey, otherPublicKey) {
    const dh = crypto.createDiffieHellman(256);
    dh.setPrivateKey(Buffer.from(privateKey, "hex"));
    return dh.computeSecret(Buffer.from(otherPublicKey, "hex"));
  }

  // Hash sensitive data
  hashData(data, salt = null) {
    const hash = crypto.createHash("sha256");
    if (salt) {
      hash.update(salt);
    }
    hash.update(data);
    return hash.digest("hex");
  }

  // Generate secure random token
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString("hex");
  }

  // Validate encryption key
  validateKey(key) {
    return key && Buffer.from(key, "hex").length === this.keyLength;
  }
}

module.exports = new EncryptionManager();
