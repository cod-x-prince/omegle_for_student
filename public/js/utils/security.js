class SecurityUtils {
  // Sanitize HTML to prevent XSS
  static sanitizeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Validate input data
  static validateInput(input, type = "string") {
    if (input === null || input === undefined) return false;

    switch (type) {
      case "email":
        return this.validateEmail(input);
      case "string":
        return typeof input === "string" && input.length > 0;
      case "number":
        return !isNaN(input);
      case "object":
        return typeof input === "object" && input !== null;
      default:
        return true;
    }
  }

  // Validate email format
  static validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  // Escape special characters for regex
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Generate secure random ID
  static generateSecureId(length = 16) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  }

  // Check if running in secure context
  static isSecureContext() {
    return window.isSecureContext;
  }

  // Validate URL to prevent open redirects
  static validateURL(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  // Content Security Policy helper
  static checkCSP() {
    const csp = document.querySelector(
      'meta[http-equiv="Content-Security-Policy"]'
    );
    return csp !== null;
  }
}

window.SecurityUtils = SecurityUtils;
