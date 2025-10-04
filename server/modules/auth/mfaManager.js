const crypto = require("crypto");
const speakeasy = require("speakeasy"); // You'll need to install this: npm install speakeasy
const QRCode = require("qrcode"); // npm install qrcode

class MFAManager {
  constructor() {
    this.issuer = "CampusConnect";
    this.backupCodeCount = 8;
    this.backupCodeLength = 10;
  }

  // Generate TOTP secret for a user
  generateSecret(userEmail) {
    const secret = speakeasy.generateSecret({
      name: `${this.issuer}:${userEmail}`,
      issuer: this.issuer,
      length: 32,
    });

    return {
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
    };
  }

  // Generate QR code for authenticator app
  async generateQRCode(otpauthUrl) {
    try {
      return await QRCode.toDataURL(otpauthUrl);
    } catch (error) {
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }

  // Verify TOTP token
  verifyToken(secret, token, window = 1) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: window,
    });
  }

  // Generate backup codes
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.backupCodeCount; i++) {
      const code = crypto
        .randomBytes(this.backupCodeLength)
        .toString("base64")
        .replace(/[+/=]/g, "")
        .substring(0, this.backupCodeLength)
        .toUpperCase();

      // Hash the code for secure storage
      const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

      codes.push({
        code: code,
        hashed: hashedCode,
        used: false,
      });
    }
    return codes;
  }

  // Verify backup code
  verifyBackupCode(backupCodes, code) {
    const hashedInput = crypto
      .createHash("sha256")
      .update(code.toUpperCase())
      .digest("hex");

    const backupCode = backupCodes.find(
      (bc) => bc.hashed === hashedInput && !bc.used
    );

    if (backupCode) {
      backupCode.used = true;
      backupCode.usedAt = new Date();
      return true;
    }

    return false;
  }

  // Get remaining backup codes
  getRemainingBackupCodes(backupCodes) {
    return backupCodes.filter((bc) => !bc.used).length;
  }

  // Generate recovery codes (for emergency access)
  generateRecoveryCode() {
    return crypto.randomBytes(32).toString("hex");
  }

  // Validate recovery session
  validateRecoverySession(recoveryCode, storedHash) {
    const inputHash = crypto
      .createHash("sha256")
      .update(recoveryCode)
      .digest("hex");
    return inputHash === storedHash;
  }
}

module.exports = new MFAManager();
