// Main application controller
class CampusConnectApp {
  constructor() {
    this.authManager = new AuthManager();
    this.videoManager = new VideoManager();
    this.socket = null;
    this.currentPage = this.getCurrentPage();

    this.initializeApp();
  }

  // Initialize application based on current page
  initializeApp() {
    switch (this.currentPage) {
      case "index":
        this.initializeHomePage();
        break;
      case "chat":
        this.initializeChatPage();
        break;
      case "verify":
        this.initializeVerifyPage();
        break;
      default:
        console.warn("Unknown page:", this.currentPage);
    }
  }

  // Get current page name from URL
  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes("chat.html")) return "chat";
    if (path.includes("verify.html")) return "verify";
    return "index";
  }

  // Initialize home page functionality
  initializeHomePage() {
    const emailForm = document.getElementById("email-form");

    if (emailForm) {
      emailForm.addEventListener("submit", (e) => this.handleEmailSubmit(e));
    }

    // Check if returning from authentication
    this.checkUrlParameters();
  }

  // Initialize chat page functionality
  initializeChatPage() {
    // Check authentication
    if (!this.authManager.requireAuth()) {
      return;
    }

    // Initialize socket connection
    this.initializeSocket();

    // Get pairing data from session storage
    const peerData = this.getPairingData();
    if (!peerData) {
      this.handleError("Missing pairing information");
      return;
    }

    // Initialize video call
    this.videoManager
      .initializeCall(peerData.peerId, peerData.initiator)
      .then((success) => {
        if (!success) {
          this.handleError("Failed to start video call");
        }
      });

    // Setup event listeners
    this.setupChatPageListeners();
  }

  // Handle email form submission
  async handleEmailSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById("email");
    const email = emailInput.value.trim().toLowerCase();

    // Validate email
    if (!this.authManager.validateEmail(email)) {
      this.showError(
        "Please enter a valid college email address (.edu or @cmrit.ac.in)"
      );
      return;
    }

    // Show loading state
    this.setLoadingState(true);

    try {
      // In a real implementation, this would communicate with the server
      // For now, we'll simulate token generation
      const token = this.generateMockToken(email);

      // Store authentication data
      this.authManager.storeAuthData(token, email);

      // Show waiting message
      this.showWaitingMessage();

      // Connect to socket (simulated)
      this.initializeSocket();
    } catch (error) {
      this.showError("Authentication failed. Please try again.");
      console.error("Authentication error:", error);
    }
  }

  // Initialize socket connection
  initializeSocket() {
    if (!this.authManager.isAuthenticated()) {
      console.warn("Cannot initialize socket: User not authenticated");
      return;
    }

    const token = this.authManager.getToken();
    this.socket = io({
      auth: {
        token: token,
      },
    });

    this.setupSocketEvents();
    window.socket = this.socket; // Make available globally for other modules
  }

  // Setup socket event listeners
  setupSocketEvents() {
    this.socket.on("connect", () => {
      console.log("Connected to server");
    });

    this.socket.on("paired", (data) => {
      this.handlePaired(data);
    });

    this.socket.on("signal", (data) => {
      this.handleSignal(data);
    });

    this.socket.on("peer-disconnected", () => {
      this.handlePeerDisconnected();
    });

    this.socket.on("pairing-timeout", () => {
      this.handlePairingTimeout();
    });

    this.socket.on("error", (error) => {
      this.handleSocketError(error);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
    });
  }

  // Handle pairing success
  handlePaired(data) {
    // Store pairing data
    sessionStorage.setItem(
      "cc_pairing_data",
      JSON.stringify({
        peerId: data.peerId,
        initiator: data.initiator,
        pairedAt: Date.now(),
      })
    );

    // Redirect to chat page
    window.location.href = "chat.html";
  }

  // Handle signaling messages
  handleSignal(data) {
    if (!data.signal) return;

    switch (data.signal.type) {
      case "offer":
        this.videoManager.handleOffer(new RTCSessionDescription(data.signal));
        break;
      case "answer":
        this.videoManager.handleAnswer(new RTCSessionDescription(data.signal));
        break;
      case "ice-candidate":
        this.videoManager.handleICECandidate(
          new RTCIceCandidate(data.signal.candidate)
        );
        break;
    }
  }

  // Handle peer disconnection
  handlePeerDisconnected() {
    this.showMessage("Your partner has disconnected. Returning to homepage.");
    this.cleanup();
    setTimeout(() => {
      window.location.href = "/";
    }, 3000);
  }

  // Handle pairing timeout
  handlePairingTimeout() {
    this.showMessage("Pairing timeout. No available partners found.");
    this.cleanup();
    setTimeout(() => {
      window.location.href = "/";
    }, 3000);
  }

  // Handle socket errors
  handleSocketError(error) {
    console.error("Socket error:", error);
    this.showError("Connection error. Please try again.");
  }

  // Setup chat page event listeners
  setupChatPageListeners() {
    const disconnectBtn = document.getElementById("disconnect-btn");
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => this.disconnectCall());
    }

    // Future: Chat input listeners will be added here
  }

  // Disconnect call and cleanup
  disconnectCall() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.videoManager.cleanup();
    this.authManager.clearAuthData();
    sessionStorage.removeItem("cc_pairing_data");

    window.location.href = "/";
  }

  // Get pairing data from session storage
  getPairingData() {
    try {
      const data = sessionStorage.getItem("cc_pairing_data");
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // Show loading state
  setLoadingState(loading) {
    const button = document.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = loading;
      button.textContent = loading ? "Searching..." : "Find a Partner";
    }
  }

  // Show waiting message
  showWaitingMessage() {
    const h1 = document.querySelector("h1");
    const p = document.querySelector("p");
    const form = document.getElementById("email-form");

    if (h1) h1.textContent = "Searching for a partner...";
    if (p) p.textContent = "Please wait, we're connecting you.";
    if (form) form.style.display = "none";
  }

  // Show error message
  showError(message) {
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
    }
  }

  // Show general message
  showMessage(message) {
    // Implementation for showing messages
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
    console.error("Application error:", message);
    this.showError(message);
  }

  // Cleanup resources
  cleanup() {
    if (this.videoManager) {
      this.videoManager.cleanup();
    }

    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // Mock token generation (replace with real implementation)
  generateMockToken(email) {
    return "mock_jwt_token_" + btoa(email) + "_" + Date.now();
  }

  // Check URL parameters for authentication results
  checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");

    if (error) {
      this.showError(decodeURIComponent(error));
    }
  }
}

// Initialize application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.app = new CampusConnectApp();
});

// Handle page unload
window.addEventListener("beforeunload", (e) => {
  if (window.app) {
    window.app.cleanup();
  }
});

// Export for testing
window.CampusConnectApp = CampusConnectApp;
