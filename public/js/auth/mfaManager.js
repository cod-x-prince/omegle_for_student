class MFAManager {
  constructor() {
    this.mfaToken = null;
    this.isMFARequired = false;
  }

  // Initialize MFA manager
  initialize() {
    this.setupEventListeners();
    console.log("MFA Manager initialized");
  }

  // Setup event listeners for MFA forms
  setupEventListeners() {
    // MFA code input formatting
    const mfaCodeInput = document.getElementById("mfaCode");
    if (mfaCodeInput) {
      mfaCodeInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").substring(0, 6);
      });
    }

    // Backup code input formatting
    const backupCodeInput = document.getElementById("backupCode");
    if (backupCodeInput) {
      backupCodeInput.addEventListener("input", (e) => {
        e.target.value = e.target.value
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, "");
      });
    }

    // Form switching
    const useBackupBtn = document.getElementById("useBackupCode");
    const backToMfaBtn = document.getElementById("backToMfa");

    if (useBackupBtn) {
      useBackupBtn.addEventListener("click", () => this.showBackupCodeForm());
    }

    if (backToMfaBtn) {
      backToMfaBtn.addEventListener("click", () => this.showMFAForm());
    }
  }

  // Show MFA verification form
  showMFAForm() {
    document.getElementById("regularLoginForm").style.display = "none";
    document.getElementById("mfaVerificationForm").style.display = "block";
    document.getElementById("backupCodeForm").style.display = "none";

    // Focus on MFA code input
    setTimeout(() => {
      const mfaCodeInput = document.getElementById("mfaCode");
      if (mfaCodeInput) mfaCodeInput.focus();
    }, 100);
  }

  // Show backup code form
  showBackupCodeForm() {
    document.getElementById("regularLoginForm").style.display = "none";
    document.getElementById("mfaVerificationForm").style.display = "none";
    document.getElementById("backupCodeForm").style.display = "block";

    // Focus on backup code input
    setTimeout(() => {
      const backupCodeInput = document.getElementById("backupCode");
      if (backupCodeInput) backupCodeInput.focus();
    }, 100);
  }

  // Show regular login form
  showRegularLoginForm() {
    document.getElementById("regularLoginForm").style.display = "block";
    document.getElementById("mfaVerificationForm").style.display = "none";
    document.getElementById("backupCodeForm").style.display = "none";
  }

  // Handle MFA verification
  async verifyMFA(code, backupCode = false) {
    try {
      const authManager = window.authManager;
      if (!authManager) {
        throw new Error("Auth manager not available");
      }

      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authManager.getUserData()?.email,
          token: backupCode ? null : code,
          backupCode: backupCode ? code : null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // MFA verified, complete login with the MFA token
        return await authManager.completeMFALogin(data.mfa_token);
      } else {
        throw new Error(data.error || "MFA verification failed");
      }
    } catch (error) {
      console.error("MFA verification error:", error);
      this.showError(error.message);
      throw error;
    }
  }

  // Setup MFA for user
  async setupMFA() {
    try {
      const authManager = window.authManager;
      if (!authManager) {
        throw new Error("Auth manager not available");
      }

      const userData = authManager.getUserData();
      if (!userData || !userData.email) {
        throw new Error("User not authenticated");
      }

      const response = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authManager.getToken()}`,
        },
        body: JSON.stringify({ email: userData.email }),
      });

      const data = await response.json();

      if (data.success) {
        return data;
      } else {
        throw new Error(data.error || "MFA setup failed");
      }
    } catch (error) {
      console.error("MFA setup error:", error);
      this.showError(error.message);
      throw error;
    }
  }

  // Verify MFA setup
  async verifyMFASetup(verificationCode) {
    try {
      const authManager = window.authManager;
      if (!authManager) {
        throw new Error("Auth manager not available");
      }

      const userData = authManager.getUserData();
      if (!userData || !userData.email) {
        throw new Error("User not authenticated");
      }

      const response = await fetch("/api/auth/mfa/verify-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authManager.getToken()}`,
        },
        body: JSON.stringify({
          email: userData.email,
          token: verificationCode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        return data;
      } else {
        throw new Error(data.error || "MFA verification failed");
      }
    } catch (error) {
      console.error("MFA verification error:", error);
      this.showError(error.message);
      throw error;
    }
  }

  // Show error message
  showError(message) {
    // You can implement a toast or modal for errors
    alert(`Security Error: ${message}`);
  }

  // Check if MFA is enabled for user
  async checkMFAStatus() {
    try {
      const authManager = window.authManager;
      if (!authManager) {
        return false;
      }

      // This would typically come from user profile
      const userData = authManager.getUserData();
      return userData && userData.mfa_enabled === true;
    } catch (error) {
      console.error("Error checking MFA status:", error);
      return false;
    }
  }
}

// Initialize MFA manager when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  window.mfaManager = new MFAManager();
  window.mfaManager.initialize();
});
