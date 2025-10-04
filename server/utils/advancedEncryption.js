const crypto = require("crypto");

class AdvancedEncryptionManager {
  constructor() {
    this.algorithm = "aes-256-gcm";
    this.keyLength = 32;
    this.ivLength = 16;
    this.authTagLength = 16;
  }

  // Generate E2E encryption keys for each session
  generateSessionKey() {
    return {
      key: crypto.randomBytes(this.keyLength),
      salt: crypto.randomBytes(16),
      iv: crypto.randomBytes(this.ivLength),
    };
  }

  // Derive key from password for key exchange
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, "sha256");
  }

  // Encrypt message with session key
  encryptMessage(message, key, iv) {
    try {
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from("CampusConnect"));

      if (iv) {
        cipher.setAAD(Buffer.from("CampusConnect"));
        const encrypted = Buffer.concat([
          cipher.update(message, "utf8"),
          cipher.final(),
        ]);

        const authTag = cipher.getAuthTag();
        return {
          encrypted: encrypted.toString("base64"),
          iv: iv.toString("base64"),
          authTag: authTag.toString("base64"),
        };
      } else {
        let encrypted = cipher.update(message, "utf8", "base64");
        encrypted += cipher.final("base64");
        const authTag = cipher.getAuthTag();

        return {
          encrypted: encrypted,
          iv: cipher.iv.toString("base64"),
          authTag: authTag.toString("base64"),
        };
      }
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  // Decrypt message with session key
  decryptMessage(encryptedData, key) {
    try {
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from("CampusConnect"));

      if (encryptedData.iv) {
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, "base64"));
        let decrypted = decipher.update(
          Buffer.from(encryptedData.encrypted, "base64")
        );
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString("utf8");
      } else {
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, "base64"));
        let decrypted = decipher.update(
          encryptedData.encrypted,
          "base64",
          "utf8"
        );
        decrypted += decipher.final("utf8");
        return decrypted;
      }
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // Generate key pair for asymmetric encryption (for key exchange)
  generateKeyPair() {
    return crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });
  }

  // Encrypt session key with public key
  encryptSessionKey(sessionKey, publicKey) {
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      sessionKey
    );

    return encrypted.toString("base64");
  }

  // Decrypt session key with private key
  decryptSessionKey(encryptedSessionKey, privateKey) {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encryptedSessionKey, "base64")
    );

    return decrypted;
  }

  // Generate digital signature
  signMessage(message, privateKey) {
    const sign = crypto.createSign("SHA256");
    sign.update(message);
    sign.end();
    return sign.sign(privateKey, "base64");
  }

  // Verify digital signature
  verifySignature(message, signature, publicKey) {
    const verify = crypto.createVerify("SHA256");
    verify.update(message);
    verify.end();
    return verify.verify(publicKey, signature, "base64");
  }

  // Hash message for integrity checking
  hashMessage(message) {
    return crypto.createHash("sha256").update(message).digest("base64");
  }
}

module.exports = new AdvancedEncryptionManager();
