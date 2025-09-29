// Main application controller
class CampusConnectApp {
  constructor() {
    console.log("CampusConnectApp: Initializing application");

    this.authManager = new AuthManager();
    this.socket = null;
    this.videoManager = null;

    this.initializeApp();
  }

  // Initialize application based on current page
  initializeApp() {
    const currentPage = this.getCurrentPage();

    console.log("CampusConnectApp: Current page detected", {
      page: currentPage,
      path: window.location.pathname,
    });

    switch (currentPage) {
      case "home":
        this.initializeHomePage();
        break;
      case "chat":
        this.initializeChatPage();
        break;
      default:
        console.warn(
          "CampusConnectApp: Unknown page, basic initialization only"
        );
        this.checkAuthenticationStatus();
    }
  }

  // Get current page name from URL
  getCurrentPage() {
    const path = window.location.pathname;
    if (path === "/" || path.includes("index.html")) return "home";
    if (path.includes("chat.html")) return "chat";
    if (path.includes("login.html")) return "login";
    if (path.includes("signup.html")) return "signup";
    return "other";
  }

  // Check and display authentication status
  checkAuthenticationStatus() {
    const isAuthenticated = this.authManager.isAuthenticated();

    console.log("CampusConnectApp: Authentication status", {
      isAuthenticated,
      currentPage: this.getCurrentPage(),
    });

    return isAuthenticated;
  }

  // Initialize home page functionality
  initializeHomePage() {
    console.log("CampusConnectApp: Initializing home page");

    const loggedInView = document.getElementById("logged-in-view");
    const loggedOutView = document.getElementById("logged-out-view");
    const logoutBtn = document.getElementById("logout-btn");
    const findPartnerBtn = document.getElementById("find-partner-btn");

    if (!loggedInView || !loggedOutView) {
      console.error("CampusConnectApp: Required home page elements not found");
      return;
    }

    const isAuthenticated = this.checkAuthenticationStatus();

    if (isAuthenticated) {
      // User is logged in, show the matchmaking/lobby view
      console.log(
        "CampusConnectApp: User authenticated, showing logged-in view"
      );

      loggedOutView.style.display = "none";
      loggedInView.style.display = "block";

      // Automatically start the connection to the server for matchmaking
      this.initializeSocket();

      // Add event listener for the logout button
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
          console.log("CampusConnectApp: Logout initiated");
          this.authManager.logout();
        });
      }

      // Add event listener for find partner button
      if (findPartnerBtn) {
        findPartnerBtn.addEventListener("click", () => {
          console.log("CampusConnectApp: Find partner button clicked");
          this.startMatchmaking();
        });
      }
    } else {
      // User is not logged in, show the normal marketing page
      console.log(
        "CampusConnectApp: User not authenticated, showing logged-out view"
      );

      loggedOutView.style.display = "block";
      loggedInView.style.display = "none";
    }
  }

  // Start the matchmaking process
  startMatchmaking() {
    console.log("CampusConnectApp: Starting matchmaking process");

    const findPartnerBtn = document.getElementById("find-partner-btn");
    const statusDiv = document.getElementById("pairing-status");

    if (findPartnerBtn) {
      findPartnerBtn.disabled = true;
      findPartnerBtn.textContent = "Searching for Partner...";
    }

    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="searching-animation">
          <h2>🔍 Searching for a study partner...</h2>
          <p>Please wait while we connect you with another student.</p>
        </div>
      `;
    }

    // Ensure socket is connected
    if (!this.socket || !this.socket.connected) {
      console.log("CampusConnectApp: Reconnecting socket for matchmaking");
      this.initializeSocket();
    }
  }

  // Initialize chat page functionality
  initializeChatPage() {
    console.log("CampusConnectApp: Initializing chat page");

    // Check authentication
    if (!this.authManager.requireAuth()) {
      console.log("CampusConnectApp: Authentication required for chat page");
      return;
    }

    console.log("CampusConnectApp: User authenticated for chat page");

    // Initialize socket connection
    this.initializeSocket();

    // Get pairing data from session storage
    const peerData = this.getPairingData();
    if (!peerData) {
      console.error("CampusConnectApp: No pairing data found for chat page");
      this.handleError("Missing pairing information. Please try again.");
      return;
    }

    console.log("CampusConnectApp: Pairing data retrieved", {
      peerId: peerData.peerId,
      initiator: peerData.initiator,
    });

    // Note: VideoManager initialization happens in chat.js
    // This is just a fallback for the main app controller

    // Setup event listeners
    this.setupChatPageListeners();
  }

  // Initialize socket connection
  initializeSocket() {
    const token = this.authManager.getToken();
    if (!token) {
      console.error(
        "CampusConnectApp: No token available for socket connection"
      );
      this.authManager.logout();
      return;
    }

    console.log("CampusConnectApp: Initializing socket connection");

    // Connect to the server with the authentication token
    this.socket = io({
      auth: {
        token: token,
      },
    });

    this.setupSocketEvents();
    window.socket = this.socket; // Make it globally accessible for debugging
  }

  // Setup socket event listeners
  setupSocketEvents() {
    if (!this.socket) {
      console.error("CampusConnectApp: No socket available for event setup");
      return;
    }

    this.socket.on("connect", () => {
      console.log("CampusConnectApp: Socket connected successfully", {
        socketId: this.socket.id,
        authenticated: true,
      });
    });

    this.socket.on("paired", (data) => {
      console.log("CampusConnectApp: Paired with partner!", data);

      // Store pairing data in session storage to use on the chat page
      sessionStorage.setItem(
        "cc_pairing_data",
        JSON.stringify({
          peerId: data.peerId,
          initiator: data.initiator,
          pairedAt: Date.now(),
        })
      );

      console.log("CampusConnectApp: Redirecting to chat page");

      // Redirect to the actual chat page
      window.location.href = "chat.html";
    });

    this.socket.on("pairing-timeout", () => {
      console.log("CampusConnectApp: Pairing timeout received");

      const statusDiv = document.getElementById("pairing-status");
      const findPartnerBtn = document.getElementById("find-partner-btn");

      if (statusDiv) {
        statusDiv.innerHTML = `
          <h2>⏰ No partners found right now.</h2>
          <p>Feel free to wait, or try again later.</p>
        `;
      }

      if (findPartnerBtn) {
        findPartnerBtn.disabled = false;
        findPartnerBtn.textContent = "Try Again";
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("CampusConnectApp: Socket disconnected", { reason });
    });

    this.socket.on("error", (error) => {
      console.error("CampusConnectApp: Socket error", error);

      // If the token is invalid, the server will disconnect the socket.
      if (
        error.message.includes("Invalid token") ||
        error.message.includes("No token provided") ||
        error.message.includes("Authentication")
      ) {
        console.error("CampusConnectApp: Authentication error, logging out");
        alert("Your session is invalid. Please log in again.");
        this.authManager.logout();
      }
    });

    this.socket.on("connected", (data) => {
      console.log("CampusConnectApp: Socket connected message", data);
    });
  }

  // Handle pairing success
  handlePaired(data) {
    console.log("CampusConnectApp: Handling paired event", data);

    // Store pairing data
    sessionStorage.setItem(
      "cc_pairing_data",
      JSON.stringify({
        peerId: data.peerId,
        initiator: data.initiator,
        pairedAt: Date.now(),
      })
    );

    console.log("CampusConnectApp: Redirecting to chat page");

    // Redirect to chat page
    window.location.href = "chat.html";
  }

  // Get pairing data from session storage
  getPairingData() {
    try {
      const data = sessionStorage.getItem("cc_pairing_data");
      const parsedData = data ? JSON.parse(data) : null;

      console.log("CampusConnectApp: Retrieved pairing data", parsedData);
      return parsedData;
    } catch (error) {
      console.error("CampusConnectApp: Error parsing pairing data", error);
      return null;
    }
  }

  // Setup chat page event listeners
  setupChatPageListeners() {
    console.log("CampusConnectApp: Setting up chat page listeners");

    const disconnectBtn = document.getElementById("disconnect-btn");

    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => this.disconnectCall());
    } else {
      console.warn(
        "CampusConnectApp: Disconnect button not found on chat page"
      );
    }
  }

  // Disconnect call and cleanup
  disconnectCall() {
    console.log("CampusConnectApp: Disconnecting call and cleaning up");

    if (this.socket) {
      this.socket.disconnect();
    }

    if (this.videoManager) {
      this.videoManager.cleanup();
    }

    this.authManager.clearAuthData();
    sessionStorage.removeItem("cc_pairing_data");

    window.location.href = "/";
  }

  // Show error message
  showError(message) {
    console.error("CampusConnectApp: Showing error message", { message });

    // Remove existing error messages
    this.clearMessages();

    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
            color: #ff6b6b;
            background: #2a2a2a;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            border-left: 4px solid #ff6b6b;
        `;

    const form = document.getElementById("email-form");
    if (form) {
      form.insertBefore(errorDiv, form.firstChild);
    } else {
      // Fallback: append to body
      document.body.insertBefore(errorDiv, document.body.firstChild);
    }
  }

  // Show general message
  showMessage(message) {
    console.log("CampusConnectApp: Showing message", { message });
    alert(message); // Replace with better UI in production
  }

  // Clear all messages
  clearMessages() {
    const existingMessages = document.querySelectorAll(
      ".error-message, .success-message"
    );
    existingMessages.forEach((msg) => msg.remove());
  }

  // Handle errors
  handleError(message) {
    console.error("CampusConnectApp: Application error", message);
    this.showError(message);
  }

  // Cleanup resources
  cleanup() {
    console.log("CampusConnectApp: Cleaning up resources");

    if (this.videoManager) {
      this.videoManager.cleanup();
    }

    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Initialize application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("CampusConnectApp: DOM loaded, initializing application");
  window.app = new CampusConnectApp();
});

// Handle page unload
window.addEventListener("beforeunload", (e) => {
  console.log("CampusConnectApp: Page unloading, cleaning up");
  if (window.app) {
    window.app.cleanup();
  }
});

// Export for testing
window.CampusConnectApp = CampusConnectApp;
