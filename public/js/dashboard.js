// Dashboard controller with video element functionality
class DashboardController {
  constructor() {
    // Safe logger initialization
    this.initializeLogger();
    this.logger.info("DashboardController: Initializing dashboard");

    this.authManager = new AuthManager();
    this.socket = null;
    this.videoManager = null;
    this.isSearching = false;
    this.isInSession = false;
    this.socketInitialized = false;

    // Video elements
    this.localVideo = null;
    this.remoteVideo = null;

    this.initializeDashboard();
  }

  initializeLogger() {
    // Create a safe logger that won't break if window.logger is not available
    if (typeof window.logger !== "undefined") {
      this.logger = window.logger;
    } else {
      // Fallback console logger
      this.logger = {
        debug: (msg, data) => console.log(`🔍 [DEBUG] ${msg}`, data),
        info: (msg, data) => console.log(`ℹ️ [INFO] ${msg}`, data),
        warn: (msg, data) => console.warn(`⚠️ [WARN] ${msg}`, data),
        error: (msg, data) => console.error(`❌ [ERROR] ${msg}`, data),
        log: (msg, data) => console.log(`ℹ️ [INFO] ${msg}`, data),
        socket: (msg, data) => console.log(`📡 [SOCKET] ${msg}`, data),
        video: (msg, data) => console.log(`🎥 [VIDEO] ${msg}`, data),
        auth: (msg, data) => console.log(`🔐 [AUTH] ${msg}`, data),
      };
      console.warn(
        "DashboardController: Using fallback logger - window.logger not found"
      );
    }
  }

  async initializeDashboard() {
    try {
      this.logger.info(
        "DashboardController: Starting dashboard initialization"
      );

      // 1. Check authentication
      if (!this.authManager.isAuthenticated()) {
        this.logger.info(
          "DashboardController: User not authenticated, redirecting to login"
        );
        window.location.href = "/login.html";
        return;
      }

      this.logger.info("DashboardController: User authenticated successfully");

      // 2. Load user data and update UI
      await this.loadUserData();

      // 3. Initialize video elements
      this.initializeVideoElements();

      // 4. Setup event listeners FIRST
      this.setupEventListeners();

      // 5. Initialize socket connection (but don't auto-connect to queue)
      this.initializeSocket();

      this.logger.info(
        "DashboardController: Dashboard initialized successfully"
      );
    } catch (error) {
      this.logger.error("DashboardController: Initialization failed", {
        error: error.message,
        stack: error.stack,
      });
      this.showError(
        "Failed to initialize dashboard. Please refresh the page."
      );
    }
  }

  initializeVideoElements() {
    this.logger.info("DashboardController: Initializing video elements");

    this.localVideo = document.getElementById("local-video");
    this.remoteVideo = document.getElementById("remote-video");

    if (this.localVideo && this.remoteVideo) {
      this.logger.info("DashboardController: Video elements initialized");

      // Set initial placeholder states
      this.showVideoPlaceholders();
    } else {
      this.logger.error("DashboardController: Video elements not found");
    }
  }

  showVideoPlaceholders() {
    // Clear any existing streams
    if (this.localVideo) {
      this.localVideo.srcObject = null;
      this.localVideo.poster =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480' viewBox='0 0 640 480'%3E%3Crect width='100%25' height='100%25' fill='%231a1a1a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='14' fill='%23333'%3EYour camera will appear here%3C/text%3E%3C/svg%3E";
    }

    if (this.remoteVideo) {
      this.remoteVideo.srcObject = null;
      this.remoteVideo.poster =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480' viewBox='0 0 640 480'%3E%3Crect width='100%25' height='100%25' fill='%231a1a1a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%23333'%3EWaiting for study partner...%3C/text%3E%3C/svg%3E";
    }
  }

  async loadUserData() {
    try {
      const userData = this.authManager.getUserData();
      const userEmailElement = document.getElementById("user-email");

      if (userEmailElement && userData) {
        userEmailElement.textContent = userData.email || "User";
      }

      this.logger.info("DashboardController: User data loaded", {
        email: userData?.email,
      });
    } catch (error) {
      this.logger.error("DashboardController: Error loading user data", error);
    }
  }

  initializeSocket() {
    // Don't reinitialize if already initialized
    if (this.socketInitialized && this.socket) {
      this.logger.info("DashboardController: Socket already initialized");
      return;
    }

    const token = this.authManager.getToken();
    if (!token) {
      this.logger.error(
        "DashboardController: No token available for socket connection"
      );
      this.authManager.logout();
      return;
    }

    this.logger.info("DashboardController: Initializing socket connection");

    try {
      this.socket = io({
        auth: {
          token: token,
        },
        // Add reconnection options
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.setupSocketEvents();
      this.socketInitialized = true;
    } catch (error) {
      this.logger.error(
        "DashboardController: Socket initialization failed",
        error
      );
      this.showError("Failed to connect to server. Please refresh the page.");
    }
  }

  setupSocketEvents() {
    if (!this.socket) {
      this.logger.error(
        "DashboardController: No socket available for event setup"
      );
      return;
    }

    // Connection events
    this.socket.on("connect", () => {
      this.logger.info("DashboardController: Socket connected successfully", {
        socketId: this.socket.id,
        connected: this.socket.connected,
      });
      this.updateConnectionStatus(true);

      // Only add to queue if we're actively searching
      if (this.isSearching) {
        this.logger.info(
          "DashboardController: Socket connected while searching, ensuring in queue"
        );
      }
    });

    this.socket.on("disconnect", (reason) => {
      this.logger.info("DashboardController: Socket disconnected", {
        reason: reason,
        wasSearching: this.isSearching,
        wasInSession: this.isInSession,
      });
      this.updateConnectionStatus(false);

      if (reason === "io server disconnect") {
        this.showError("Server disconnected. Please log in again.");
        setTimeout(() => {
          this.authManager.logout();
        }, 2000);
      } else if (this.isSearching || this.isInSession) {
        // If we were searching or in session, try to reconnect
        this.logger.info("DashboardController: Attempting to reconnect...");
        setTimeout(() => {
          if (this.isSearching || this.isInSession) {
            this.initializeSocket();
          }
        }, 2000);
      }
    });

    // Matchmaking events
    this.socket.on("paired", (data) => {
      this.logger.info("DashboardController: Paired with partner!", data);
      this.handlePairingSuccess(data);
    });

    this.socket.on("pairing-timeout", () => {
      this.logger.info("DashboardController: Pairing timeout received");
      this.handlePairingTimeout();
    });

    this.socket.on("queue-update", (data) => {
      this.logger.info("DashboardController: Queue update", data);
      this.updateQueueStatus(data);
    });

    // WebRTC signaling events
    this.socket.on("signal", (data) => {
      this.logger.info("DashboardController: WebRTC signal received", {
        type: data.signal?.type,
        from: data.from,
      });
      if (this.videoManager) {
        this.videoManager.handleSignal(data.signal);
      }
    });

    this.socket.on("peer-disconnected", () => {
      this.logger.info("DashboardController: Peer disconnected");
      this.handlePeerDisconnected();
    });

    // Error events
    this.socket.on("error", (error) => {
      this.logger.error("DashboardController: Socket error", error);
      this.showError("Connection error: " + (error.message || "Unknown error"));
    });

    this.socket.on("connect_error", (error) => {
      this.logger.error("DashboardController: Socket connection error", error);
      this.showError(
        "Failed to connect to server. Please check your internet connection."
      );
    });

    this.logger.info("DashboardController: Socket event handlers registered");
  }

  setupEventListeners() {
    this.logger.info("DashboardController: Setting up UI event listeners");

    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Logout initiated");
        this.cleanup();
        this.authManager.logout();
      });
    }

    // Find partner button
    const findPartnerBtn = document.getElementById("find-partner-btn");
    if (findPartnerBtn) {
      findPartnerBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Find partner button clicked");
        this.startMatchmaking();
      });
    }

    // Cancel search button
    const cancelSearchBtn = document.getElementById("cancel-search-btn");
    if (cancelSearchBtn) {
      cancelSearchBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Cancel search button clicked");
        this.cancelMatchmaking();
      });
    }

    // Session control buttons
    const toggleVideoBtn = document.getElementById("toggle-video");
    const toggleAudioBtn = document.getElementById("toggle-audio");
    const endSessionBtn = document.getElementById("end-session");

    if (toggleVideoBtn) {
      toggleVideoBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Toggle video clicked");
        this.toggleVideo();
      });
    }

    if (toggleAudioBtn) {
      toggleAudioBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Toggle audio clicked");
        this.toggleAudio();
      });
    }

    if (endSessionBtn) {
      endSessionBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: End session clicked");
        this.endSession();
      });
    }

    // Window resize handler
    window.addEventListener("resize", () => {
      // Handle any responsive layout adjustments if needed
      this.logger.debug("DashboardController: Window resized");
    });

    this.logger.info("DashboardController: UI event listeners setup completed");
  }

  async startMatchmaking() {
    this.logger.info("DashboardController: Starting matchmaking process");

    if (this.isSearching) {
      this.logger.warn("DashboardController: Already searching for partner");
      return;
    }

    this.isSearching = true;

    // Update UI to show searching state
    this.showSearchingState();

    // Ensure socket is connected and ready
    if (!this.socket || !this.socket.connected) {
      this.logger.info(
        "DashboardController: Socket not connected, initializing..."
      );
      this.initializeSocket();

      // Wait for connection
      await new Promise((resolve) => {
        if (this.socket.connected) {
          resolve();
        } else {
          this.socket.once("connect", resolve);
        }
      });
    }

    // Initialize video manager and start camera
    try {
      await this.initializeVideoManager();
      this.logger.info(
        "DashboardController: Video manager initialized successfully"
      );
    } catch (error) {
      this.logger.error(
        "DashboardController: Failed to initialize video manager",
        error
      );
      this.showError("Failed to access camera. Please check permissions.");
      this.cancelMatchmaking();
      return;
    }

    this.logger.info(
      "DashboardController: Matchmaking started - ready for pairing"
    );
  }

  async initializeVideoManager() {
    this.logger.info("DashboardController: Initializing video manager");

    try {
      // Debug: Check if VideoManager exists and what it contains
      this.logger.info("VideoManager check:", {
        exists: typeof VideoManager !== "undefined",
        type: typeof VideoManager,
        constructor:
          typeof VideoManager === "function" ? "function" : "not function",
        prototype:
          typeof VideoManager === "function" ? VideoManager.prototype : "none",
      });

      if (typeof VideoManager === "undefined") {
        this.logger.error("DashboardController: VideoManager not found");
        throw new Error("VideoManager not available");
      }

      this.videoManager = new VideoManager(
        this.socket,
        null, // peerId will be set when paired
        false, // initiator status will be set when paired
        this.localVideo, // Pass video elements instead of canvases
        this.remoteVideo
      );

      // Debug: Check the videoManager instance
      this.logger.info("VideoManager instance created:", {
        instance: this.videoManager,
        hasInitialize: typeof this.videoManager.initialize === "function",
        methods: Object.getOwnPropertyNames(
          Object.getPrototypeOf(this.videoManager)
        ),
      });

      await this.videoManager.initialize();
      this.logger.info(
        "DashboardController: Video manager initialized successfully"
      );
    } catch (error) {
      this.logger.error(
        "DashboardController: Video manager initialization failed",
        error
      );
      throw error;
    }
  }

  cancelMatchmaking() {
    this.logger.info("DashboardController: Canceling matchmaking");

    if (!this.isSearching) {
      return;
    }

    this.isSearching = false;

    // Clean up video manager
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    // Don't disconnect socket entirely, just remove from queue
    if (this.socket && this.socket.connected) {
      // The server will automatically remove from queue on disconnect
      // but we want to keep the socket connection for future use
      this.logger.info("DashboardController: Keeping socket connection active");
    }

    // Update UI back to normal state
    this.hideSearchingState();
    this.hideVideoSection();

    // Reset video elements
    this.showVideoPlaceholders();

    this.logger.info("DashboardController: Matchmaking canceled");
  }

  handlePairingSuccess(data) {
    this.logger.info("DashboardController: Handling pairing success", data);

    this.isSearching = false;
    this.isInSession = true;

    // Update video manager with peer information
    if (this.videoManager) {
      this.videoManager.peerId = data.peerId;
      this.videoManager.isInitiator = data.initiator;

      // Start WebRTC connection
      if (data.initiator) {
        this.logger.info(
          "DashboardController: We are the initiator, starting WebRTC offer"
        );
        this.videoManager.createOffer().catch((error) => {
          this.logger.error(
            "DashboardController: Failed to create offer",
            error
          );
        });
      }
    }

    // Show video section and hide searching state
    this.showVideoSection();
    this.hideSearchingState();

    // Update call status
    this.updateCallStatus("Connected with study partner", "connected");

    this.logger.info("DashboardController: Session started with partner");
  }

  handlePairingTimeout() {
    this.logger.info("DashboardController: Handling pairing timeout");

    this.isSearching = false;
    this.hideSearchingState();

    this.showMessage(
      "No study partners found at the moment. Please try again later.",
      "info"
    );

    // Clean up video manager
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    // Reset video elements
    this.showVideoPlaceholders();
  }

  handlePeerDisconnected() {
    this.logger.info("DashboardController: Handling peer disconnection");

    this.isInSession = false;

    this.showMessage("Your study partner has disconnected.", "info");
    this.endSession();
  }

  toggleVideo() {
    if (this.videoManager) {
      const newState = this.videoManager.toggleVideo();
      const videoBtn = document.getElementById("toggle-video");

      if (videoBtn) {
        videoBtn.textContent = newState ? "📹" : "📵";
        videoBtn.classList.toggle("active", newState);
      }

      this.logger.info("DashboardController: Video toggled", {
        enabled: newState,
      });
    }
  }

  toggleAudio() {
    if (this.videoManager) {
      const newState = this.videoManager.toggleAudio();
      const audioBtn = document.getElementById("toggle-audio");

      if (audioBtn) {
        audioBtn.textContent = newState ? "🎤" : "🔇";
        audioBtn.classList.toggle("active", newState);
      }

      this.logger.info("DashboardController: Audio toggled", {
        enabled: newState,
      });
    }
  }

  endSession() {
    this.logger.info("DashboardController: Ending session");

    this.isInSession = false;

    // Clean up video manager
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    // Hide video section and show main dashboard
    this.hideVideoSection();

    // Reset UI
    this.updateCallStatus("Ready to connect", "searching");
    this.showVideoPlaceholders();

    this.logger.info("DashboardController: Session ended");
  }

  // UI State Management Methods
  showSearchingState() {
    const statusSection = document.getElementById("status-section");
    const findPartnerBtn = document.getElementById("find-partner-btn");

    if (statusSection) statusSection.style.display = "block";
    if (findPartnerBtn) {
      findPartnerBtn.disabled = true;
      findPartnerBtn.textContent = "Searching...";
    }

    this.updateCallStatus("Searching for study partner...", "searching");
  }

  hideSearchingState() {
    const statusSection = document.getElementById("status-section");
    const findPartnerBtn = document.getElementById("find-partner-btn");

    if (statusSection) statusSection.style.display = "none";
    if (findPartnerBtn) {
      findPartnerBtn.disabled = false;
      findPartnerBtn.textContent = "Start Searching";
    }
  }

  showVideoSection() {
    const videoSection = document.getElementById("video-section");
    const actionsSection = document.querySelector(".actions-section");

    if (videoSection) videoSection.style.display = "block";
    if (actionsSection) actionsSection.style.display = "none";
  }

  hideVideoSection() {
    const videoSection = document.getElementById("video-section");
    const actionsSection = document.querySelector(".actions-section");

    if (videoSection) videoSection.style.display = "none";
    if (actionsSection) actionsSection.style.display = "block";
  }

  updateQueueStatus(data) {
    if (!this.isSearching) return;

    const queuePosition = document.getElementById("queue-position");
    if (queuePosition) {
      queuePosition.textContent = data.position || "1";
    }
  }

  updateCallStatus(message, type = "searching") {
    const callStatus = document.getElementById("call-status");
    if (callStatus) {
      callStatus.textContent = message;
      callStatus.className = `status-${type}`;
    }
  }

  updateConnectionStatus(connected) {
    const indicator = document.getElementById("connection-indicator");
    if (indicator) {
      indicator.textContent = connected ? "🟢 Connected" : "🔴 Disconnected";
      indicator.className = `connection-indicator ${
        connected ? "connected" : "disconnected"
      }`;
      indicator.style.display = "block";
    }

    // Auto-hide connected indicator after 3 seconds
    if (connected) {
      setTimeout(() => {
        if (indicator && indicator.classList.contains("connected")) {
          indicator.style.display = "none";
        }
      }, 3000);
    }
  }

  showMessage(message, type = "info") {
    this.logger.info(`DashboardController: Showing ${type} message`, {
      message,
    });

    // Remove existing messages
    this.clearMessages();

    const messageDiv = document.createElement("div");
    messageDiv.className = `dashboard-message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1000;
            text-align: center;
            background: ${
              type === "error"
                ? "var(--error-color)"
                : type === "success"
                ? "var(--success-color)"
                : "var(--accent-secondary)"
            };
            color: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;

    document.body.appendChild(messageDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.remove();
      }
    }, 5000);
  }

  showError(message) {
    this.showMessage(message, "error");
  }

  clearMessages() {
    const existingMessages = document.querySelectorAll(".dashboard-message");
    existingMessages.forEach((msg) => msg.remove());
  }

  // Cleanup resources
  cleanup() {
    this.logger.info("DashboardController: Cleaning up resources");

    this.isSearching = false;
    this.isInSession = false;

    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.socketInitialized = false;
    }
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Safe logger check before initialization
  if (typeof window.logger !== "undefined") {
    window.logger.info(
      "Dashboard: DOM loaded, initializing dashboard controller"
    );
  } else {
    console.log(
      "Dashboard: DOM loaded, initializing dashboard controller (fallback logger)"
    );
  }
  window.dashboard = new DashboardController();
});

// Handle page unload
window.addEventListener("beforeunload", () => {
  if (typeof window.logger !== "undefined") {
    window.logger.info("Dashboard: Page unloading, cleaning up");
  } else {
    console.log("Dashboard: Page unloading, cleaning up (fallback logger)");
  }
  if (window.dashboard) {
    window.dashboard.cleanup();
  }
});
