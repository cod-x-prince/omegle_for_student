// In public/js/auth.js

class AuthManager {
  constructor() {
    this.tokenKey = "campus_connect_token";
    this.userKey = "campus_connect_user";
    this.initialize();
  }

  initialize() {
    console.log("AuthManager: Initializing authentication manager");
    this.checkAuthenticationStatus();
  }

  checkAuthenticationStatus() {
    const token = this.getToken();
    const isAuthenticated = !!token;

    console.log("AuthManager: Authentication status check", {
      isAuthenticated,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
    });

    return isAuthenticated;
  }

  isAuthenticated() {
    const token = this.getToken();
    if (!token) {
      console.log("AuthManager: No token found - user not authenticated");
      return false;
    }

    // Basic token validation (could be enhanced with JWT expiration check)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const isExpired = payload.exp && payload.exp < Date.now() / 1000;

      if (isExpired) {
        console.warn("AuthManager: Token expired", { exp: payload.exp });
        this.clearAuthData();
        return false;
      }

      console.log("AuthManager: Token valid", { email: payload.email });
      return true;
    } catch (error) {
      console.error("AuthManager: Token validation error", {
        error: error.message,
      });
      this.clearAuthData();
      return false;
    }
  }

  getToken() {
    const token = localStorage.getItem(this.tokenKey);
    console.log("AuthManager: Retrieving token", {
      exists: !!token,
      length: token ? token.length : 0,
    });
    return token;
  }

  storeAuthData(token, userData) {
    try {
      if (!token) {
        throw new Error("No token provided for storage");
      }

      localStorage.setItem(this.tokenKey, token);

      if (userData) {
        localStorage.setItem(this.userKey, JSON.stringify(userData));
      }

      console.log("AuthManager: Authentication data stored successfully", {
        tokenLength: token.length,
        userData: !!userData,
      });

      return true;
    } catch (error) {
      console.error("AuthManager: Error storing auth data", {
        error: error.message,
      });
      return false;
    }
  }

  clearAuthData() {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
      console.log("AuthManager: Authentication data cleared");
      return true;
    } catch (error) {
      console.error("AuthManager: Error clearing auth data", {
        error: error.message,
      });
      return false;
    }
  }

  getUserData() {
    try {
      const userData = localStorage.getItem(this.userKey);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error("AuthManager: Error retrieving user data", {
        error: error.message,
      });
      return null;
    }
  }

  requireAuth(redirectUrl = "/login.html") {
    if (!this.isAuthenticated()) {
      console.log(
        "AuthManager: Authentication required - redirecting to login"
      );
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  logout(redirectUrl = "/") {
    console.log("AuthManager: Logging out user");
    this.clearAuthData();
    window.location.href = redirectUrl;
  }

  validateEmail(email) {
    const allowedDomains = [".edu", "@cmrit.ac.in"];
    const isValidEmail = allowedDomains.some((domain) =>
      email.toLowerCase().endsWith(domain.toLowerCase())
    );

    console.log("AuthManager: Email validation", {
      email,
      isValid: isValidEmail,
    });

    return isValidEmail;
  }
}

// Initialize authentication when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  console.log("Auth: DOM loaded - initializing authentication forms");

  const path = window.location.pathname;
  const authManager = new AuthManager();

  // Make authManager globally available
  window.authManager = authManager;

  // Initialize form logic based on the current page
  if (path.includes("signup.html")) {
    console.log("Auth: Initializing signup form");
    initializeSignupForm(authManager);
  } else if (path.includes("login.html")) {
    console.log("Auth: Initializing login form");
    initializeLoginForm(authManager);
  }

  // Initialize password toggles on any page that has them
  initializePasswordToggles();
});

function initializePasswordToggles() {
  console.log("Auth: Initializing password toggles");

  const toggleButtons = document.querySelectorAll(".password-toggle");

  toggleButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const passwordInput = this.previousElementSibling;

      if (
        passwordInput &&
        (passwordInput.type === "password" || passwordInput.type === "text")
      ) {
        const isPassword = passwordInput.getAttribute("type") === "password";
        passwordInput.setAttribute("type", isPassword ? "text" : "password");
        this.textContent = isPassword ? "🙈" : "👁️";

        console.log("Auth: Password visibility toggled", {
          isVisible: !isPassword,
        });
      }
    });
  });
}

function initializeSignupForm(authManager) {
  const signupForm = document.getElementById("signupForm");
  if (!signupForm) {
    console.error("Auth: Signup form not found");
    return;
  }

  console.log("Auth: Setting up signup form event listeners");

  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const submitBtn = this.querySelector(".auth-submit-btn");
    clearMessages();

    console.log("Auth: Signup form submitted");

    // Validate passwords match
    if (this.password.value !== this.confirmPassword.value) {
      console.warn("Auth: Password mismatch during signup");
      showMessage("Passwords do not match!", "error");
      return;
    }

    // Validate email domain
    if (!authManager.validateEmail(this.email.value)) {
      console.warn("Auth: Invalid email domain during signup", {
        email: this.email.value,
      });
      showMessage(
        "Please use a valid college email address (.edu or @cmrit.ac.in)",
        "error"
      );
      return;
    }

    setLoading(submitBtn, true);

    const formData = {
      firstName: this.firstName.value,
      lastName: this.lastName.value,
      email: this.email.value,
      college: this.college.value,
      major: this.major.value,
      password: this.password.value,
    };

    console.log("Auth: Attempting signup", { email: formData.email });

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Auth: Signup API error", {
          status: response.status,
          error: result.error,
        });
        throw new Error(result.error || "Signup failed");
      }

      console.log("Auth: Signup successful", { email: formData.email });
      showMessage(result.message, "success");

      // For now, we'll auto-login after signup
      if (result.token) {
        authManager.storeAuthData(result.token, {
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
        });

        setTimeout(() => (window.location.href = "/dashboard.html"), 2000);
      }
    } catch (error) {
      console.error("Auth: Signup process failed", { error: error.message });
      showMessage(error.message, "error");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

function initializeLoginForm(authManager) {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) {
    console.error("Auth: Login form not found");
    return;
  }

  console.log("Auth: Setting up login form event listeners");

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const submitBtn = this.querySelector(".auth-submit-btn");
    clearMessages();

    console.log("Auth: Login form submitted");

    setLoading(submitBtn, true);

    const formData = {
      email: this.email.value,
      password: this.password.value,
    };

    console.log("Auth: Attempting login", { email: formData.email });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Auth: Login API error", {
          status: response.status,
          error: result.error,
        });
        throw new Error(result.error || "Login failed");
      }

      console.log("Auth: Login successful", { email: formData.email });
      showMessage("Login successful! Redirecting...", "success");

      authManager.storeAuthData(result.token, {
        email: formData.email,
        ...result.user,
      });

      setTimeout(() => (window.location.href = "/dashboard.html"), 1500);
    } catch (error) {
      console.error("Auth: Login process failed", { error: error.message });
      showMessage(error.message, "error");
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

// --- Helper Functions ---

function setLoading(button, isLoading) {
  if (isLoading) {
    button.classList.add("loading");
    button.disabled = true;
    button.textContent =
      button.getAttribute("data-loading-text") || "Processing...";
    console.log("Auth: Button set to loading state");
  } else {
    button.classList.remove("loading");
    button.disabled = false;
    button.textContent =
      button.getAttribute("data-original-text") || button.textContent;
    console.log("Auth: Button loading state removed");
  }
}

function showMessage(message, type = "info") {
  const container = document.querySelector(".auth-card");
  if (!container) {
    console.error("Auth: Message container not found");
    return;
  }

  clearMessages();

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = message;
  messageDiv.style.cssText = `
        padding: 15px;
        margin-bottom: 20px;
        border-radius: 8px;
        text-align: center;
        font-weight: 500;
        border: 1px solid;
        color: ${type === "error" ? "#ff6b6b" : "#51cf66"};
        background-color: ${
          type === "error"
            ? "rgba(255, 107, 107, 0.1)"
            : "rgba(81, 207, 102, 0.1)"
        };
        border-color: ${
          type === "error"
            ? "rgba(255, 107, 107, 0.3)"
            : "rgba(81, 207, 102, 0.3)"
        };
    `;

  container.insertBefore(messageDiv, container.firstChild);

  console.log("Auth: Message displayed", { type, message });
}

function clearMessages() {
  const messages = document.querySelectorAll(".message");
  messages.forEach((el) => el.remove());

  if (messages.length > 0) {
    console.log("Auth: Cleared existing messages", { count: messages.length });
  }
}
