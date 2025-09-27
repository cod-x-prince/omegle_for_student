class AuthManager {
  constructor() {
    this.tokenKey = "cc_auth_token";
    this.userKey = "cc_user_data";
  }

  // Validate email format and domain
  validateEmail(email) {
    if (!email || typeof email !== "string") return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return false;

    // Allowed domains (also validated on server)
    const allowedDomains = [".edu", "@cmrit.ac.in"];
    return allowedDomains.some((domain) =>
      email.toLowerCase().endsWith(domain)
    );
  }

  // Store authentication data
  storeAuthData(token, email) {
    try {
      const encryptedToken = this.encryptData(token);
      const userData = {
        email: email,
        timestamp: Date.now(),
        expires: Date.now() + 3600000, // 1 hour
      };

      sessionStorage.setItem(this.tokenKey, encryptedToken);
      sessionStorage.setItem(this.userKey, JSON.stringify(userData));
      return true;
    } catch (error) {
      console.error("Error storing auth data:", error);
      return false;
    }
  }

  // Retrieve authentication token
  getToken() {
    try {
      const encryptedToken = sessionStorage.getItem(this.tokenKey);
      return encryptedToken ? this.decryptData(encryptedToken) : null;
    } catch (error) {
      console.error("Error retrieving token:", error);
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = this.getToken();
    const userData = this.getUserData();

    if (!token || !userData) return false;

    // Check expiration
    if (Date.now() > userData.expires) {
      this.clearAuthData();
      return false;
    }

    return true;
  }

  // Clear authentication data
  clearAuthData() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.userKey);
  }

  // Basic encryption (in production, use more secure methods)
  encryptData(data) {
    return btoa(unescape(encodeURIComponent(data)));
  }

  decryptData(encrypted) {
    try {
      return decodeURIComponent(escape(atob(encrypted)));
    } catch {
      return null;
    }
  }

  // Get user data
  getUserData() {
    try {
      return JSON.parse(sessionStorage.getItem(this.userKey));
    } catch {
      return null;
    }
  }

  // Redirect to login if not authenticated
  requireAuth(redirectUrl = "/") {
    if (!this.isAuthenticated()) {
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }
}

// Export for use in other modules
window.AuthManager = AuthManager;
