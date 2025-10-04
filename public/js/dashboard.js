// Add this at the top of dashboard.js or in initializeDashboard method
console.log("Checking for VideoManager...");
console.log(
  "Available scripts:",
  Array.from(document.scripts).map((s) => s.src)
);
console.log("VideoManager defined:", typeof VideoManager);
console.log("videoManager defined:", typeof videoManager); // Check lowercase too
// Dashboard controller with enhanced pairing system
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
    this.currentMode = null; // 'video' or 'text'
    this.encouragementInterval = null;

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

      // 6. Update stats
      this.updateStats();

      // 7. Load activities
      this.loadActivities();

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

    // Try multiple possible element IDs/selectors
    this.localVideo =
      document.getElementById("local-video") ||
      document.querySelector("#localVideo") ||
      document.querySelector(".local-video");

    this.remoteVideo =
      document.getElementById("remote-video") ||
      document.querySelector("#remoteVideo") ||
      document.querySelector(".remote-video");

    if (this.localVideo && this.remoteVideo) {
      this.logger.info("DashboardController: Video elements initialized", {
        localVideo: this.localVideo.id || this.localVideo.className,
        remoteVideo: this.remoteVideo.id || this.remoteVideo.className,
      });

      // Set initial placeholder states
      this.showVideoPlaceholders();
    } else {
      this.logger.warn(
        "DashboardController: Video elements not found - this is normal for dashboard view",
        {
          localVideoFound: !!this.localVideo,
          remoteVideoFound: !!this.remoteVideo,
        }
      );

      // Create fallback elements if needed for dashboard preview
      if (!this.localVideo || !this.remoteVideo) {
        this.createFallbackVideoElements();
      }
    }
  }

  // Add this new method for fallback video elements
  createFallbackVideoElements() {
    this.logger.info(
      "DashboardController: Creating fallback video elements for dashboard"
    );

    // These will be used when the actual video chat page loads
    this.localVideo = document.createElement("video");
    this.remoteVideo = document.createElement("video");

    this.localVideo.id = "local-video-fallback";
    this.remoteVideo.id = "remote-video-fallback";
    this.localVideo.style.display = "none";
    this.remoteVideo.style.display = "none";

    document.body.appendChild(this.localVideo);
    document.body.appendChild(this.remoteVideo);
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

    // Video chat button
    const startVideoChatBtn = document.getElementById("start-video-chat");
    if (startVideoChatBtn) {
      startVideoChatBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Start video chat clicked");
        this.startVideoChat();
      });
    }

    // Text chat button
    const startTextChatBtn = document.getElementById("start-text-chat");
    if (startTextChatBtn) {
      startTextChatBtn.addEventListener("click", () => {
        this.logger.info("DashboardController: Start text chat clicked");
        this.startTextChat();
      });
    }

    // Legacy find partner button (keep for compatibility)
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
      this.logger.debug("DashboardController: Window resized");
    });

    this.logger.info("DashboardController: UI event listeners setup completed");
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
        timeout: 10000, // Add timeout
      });

      this.setupSocketEvents();
      this.socketInitialized = true;

      // Add connection timeout
      setTimeout(() => {
        if (this.socket && !this.socket.connected) {
          this.logger.error("DashboardController: Socket connection timeout");
          this.showError("Connection timeout. Please refresh the page.");
        }
      }, 10000);
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

    // NEW: Enhanced pairing system events
    this.socket.on("pairing:queued", (data) => {
      this.logger.info("DashboardController: Added to pairing queue", data);
      this.showQueueStatus(data.position, data.queueSize, data.totalUsers);
    });

    this.socket.on("pairing:status", (data) => {
      this.logger.info("DashboardController: Queue status update", data);
      this.handleQueueStatusUpdate(data);
    });

    this.socket.on("pairing:matched", (data) => {
      this.logger.info("DashboardController: Paired with partner!", data);
      this.handlePairingSuccess(data);
    });

    this.socket.on("pairing:timeout", (data) => {
      this.logger.info("DashboardController: Pairing timeout received", data);
      this.handlePairingTimeout(data);
    });

    this.socket.on("pairing:error", (error) => {
      this.logger.error("DashboardController: Pairing error", error);
      this.showError(`Pairing error: ${error.message}`);
      this.cancelMatchmaking();
    });

    this.socket.on("pairing:left", (data) => {
      this.logger.info("DashboardController: Left pairing queue", data);
      this.cancelMatchmaking();
    });

    // Legacy events (for backward compatibility)
    this.socket.on("paired", (data) => {
      this.logger.info(
        "DashboardController: Paired with partner (legacy)!",
        data
      );
      this.handlePairingSuccess(data);
    });

    this.socket.on("pairing-timeout", () => {
      this.logger.info(
        "DashboardController: Pairing timeout received (legacy)"
      );
      this.handlePairingTimeout({});
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

  // NEW: Enhanced queue status handling
  showQueueStatus(position, queueSize, totalUsers) {
    if (!this.isSearching) return;

    const queuePosition = document.getElementById("queue-position");
    if (queuePosition) {
      queuePosition.textContent = position || "1";
    }

    const indicator = document.getElementById("connection-indicator");
    if (indicator) {
      if (queueSize === 1) {
        indicator.textContent = "👋 You're the first one here!";
        indicator.style.background = "var(--accent-secondary)";
      } else {
        indicator.textContent = `🟡 Position: ${position} of ${queueSize}`;
        indicator.style.background = "var(--accent-color)";
      }
      indicator.style.display = "block";
    }

    if (queueSize === 1) {
      this.addActivity("👋 Waiting for another student to join...");
    } else {
      this.addActivity(`📊 Queue position: ${position} of ${queueSize}`);
    }
  }

  // NEW: Handle queue status updates with encouragement
  handleQueueStatusUpdate(data) {
    if (!this.isSearching) return;

    const indicator = document.getElementById("connection-indicator");
    if (indicator && data.message) {
      indicator.textContent = data.message;
      indicator.style.display = "block";

      // Add visual feedback for encouragement messages
      if (data.showEncouragement) {
        indicator.style.background = "var(--warning)";
        indicator.style.animation = "pulse 2s infinite";

        // Remove animation after 5 seconds
        setTimeout(() => {
          indicator.style.animation = "";
        }, 5000);
      }
    }

    // Update queue info if provided
    if (data.queueSize !== undefined) {
      const queuePosition = document.getElementById("queue-position");
      if (queuePosition) {
        queuePosition.textContent = data.position || "1";
      }
    }

    // Log the status update
    this.logger.debug(
      "DashboardController: Queue status update received",
      data
    );
  }

  // NEW METHODS FOR VIDEO AND TEXT CHAT
  startVideoChat() {
    this.logger.info("DashboardController: Starting video chat");
    this.startMatchmakingWithMode("video");
  }

  startTextChat() {
    this.logger.info("DashboardController: Starting text chat");
    this.startMatchmakingWithMode("text");
  }

  async startMatchmakingWithMode(mode) {
    this.logger.info(
      `DashboardController: Starting matchmaking for ${mode} chat`
    );

    if (this.isSearching) {
      this.logger.warn("DashboardController: Already searching for partner");
      return;
    }

    this.isSearching = true;
    this.currentMode = mode;

    // Update UI to show searching state
    this.showSearchingState(mode);

    // For video chat, check if VideoManager is available (both cases)
    if (mode === "video") {
      const VideoManagerClass = window.VideoManager || window.videoManager;
      if (typeof VideoManagerClass === "undefined") {
        this.logger.error("DashboardController: VideoManager not available");
        this.showError(
          "Video chat is not available right now. Please try text chat or refresh the page."
        );
        this.cancelMatchmaking();
        return;
      }

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
    }

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

    // Join the pairing queue with the specified mode
    this.joinPairingQueue(mode);
  }

  // NEW METHOD: Join pairing queue with mode
  joinPairingQueue(mode) {
    if (!this.socket || !this.socket.connected) {
      this.logger.error(
        "DashboardController: Socket not connected for pairing"
      );
      this.showError("Connection error. Please try again.");
      this.cancelMatchmaking();
      return;
    }

    this.logger.info(
      `DashboardController: Joining pairing queue for ${mode} chat`
    );

    // Emit the pairing request with mode
    this.socket.emit("pairing:join", {
      mode: mode,
      userData: this.authManager.getUserData(),
    });

    // Add to activity
    this.addActivity(`🔍 Started searching for ${mode} study partner`);
  }

  async startMatchmakingWithMode(mode) {
    this.logger.info(
      `DashboardController: Starting matchmaking for ${mode} chat`
    );

    if (this.isSearching) {
      this.logger.warn("DashboardController: Already searching for partner");
      return;
    }

    this.isSearching = true;
    this.currentMode = mode;

    // Update UI to show searching state
    this.showSearchingState(mode);

    // For video chat, ensure VideoManager is available
    if (mode === "video") {
      // FIX: Check if VideoManager is available (it should be now)
      if (typeof VideoManager === "undefined") {
        this.logger.error("DashboardController: VideoManager not available", {
          available: typeof VideoManager,
          windowVideoManager: window.VideoManager,
        });
        this.showError(
          "Video chat is not available right now. Please try text chat or refresh the page."
        );
        this.cancelMatchmaking();
        return;
      }

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
    }

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

    // Join the pairing queue with the specified mode
    this.joinPairingQueue(mode);
  }

  async initializeVideoManager() {
    this.logger.info("DashboardController: Initializing video manager");

    // Enhanced check with better logging
    if (typeof VideoManager === "undefined") {
      this.logger.error(
        "DashboardController: VideoManager not available - debugging info",
        {
          VideoManager: typeof VideoManager,
          windowKeys: Object.keys(window).filter(
            (k) =>
              k.toLowerCase().includes("video") ||
              k.toLowerCase().includes("manager")
          ),
        }
      );
      throw new Error("VideoManager not available");
    }

    this.logger.info(
      "DashboardController: VideoManager class found, creating instance"
    );

    try {
      // Ensure video elements exist
      if (!this.localVideo || !this.remoteVideo) {
        this.initializeVideoElements();
      }

      this.logger.info("DashboardController: Creating VideoManager instance", {
        hasSocket: !!this.socket,
        hasLocalVideo: !!this.localVideo,
        hasRemoteVideo: !!this.remoteVideo,
      });

      this.videoManager = new VideoManager(
        this.socket,
        null, // peerId will be set when paired
        false, // initiator status will be set when paired
        this.localVideo,
        this.remoteVideo
      );

      this.logger.info(
        "DashboardController: VideoManager instance created, calling initialize()"
      );

      await this.videoManager.initialize();
      this.logger.info(
        "DashboardController: Video manager initialized successfully"
      );
    } catch (error) {
      this.logger.error(
        "DashboardController: Video manager initialization failed",
        {
          error: error.message,
          stack: error.stack,
          videoManagerType: typeof this.videoManager,
        }
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
    this.currentMode = null;

    // Clear any encouragement intervals
    if (this.encouragementInterval) {
      clearInterval(this.encouragementInterval);
      this.encouragementInterval = null;
    }

    // Notify server we're leaving the queue
    if (this.socket && this.socket.connected) {
      this.socket.emit("pairing:leave");
    }

    // Clean up video manager
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
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

    // Clear any encouragement intervals
    if (this.encouragementInterval) {
      clearInterval(this.encouragementInterval);
      this.encouragementInterval = null;
    }

    // Update video manager with peer information if video mode
    if (this.currentMode === "video" && this.videoManager) {
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

    // Redirect to appropriate page based on mode
    setTimeout(() => {
      if (this.currentMode === "video") {
        this.addActivity("✅ Matched with video study partner!");
        window.location.href = "/video-chat";
      } else {
        this.addActivity("✅ Matched with text chat partner!");
        window.location.href = "/chat";
      }
    }, 1000);

    this.logger.info(
      `DashboardController: ${this.currentMode} session starting with partner`
    );
  }

  // UPDATED: Enhanced pairing timeout handling
  handlePairingTimeout(data) {
    this.logger.info("DashboardController: Handling pairing timeout", data);

    this.isSearching = false;
    this.currentMode = null;
    this.hideSearchingState();

    // Clear any encouragement intervals
    if (this.encouragementInterval) {
      clearInterval(this.encouragementInterval);
      this.encouragementInterval = null;
    }

    // Show timeout message with suggestions
    const message = data.message || "No study partners available right now";
    const suggestion = data.suggestion || "Try again during peak hours!";

    this.showMessage(`${message} ${suggestion}`, "info");

    // Add retry button if suggested
    if (data.retryAfter) {
      this.showRetryButton(data.retryAfter);
    }

    // Clean up video manager
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    // Reset video elements
    this.showVideoPlaceholders();

    // Add to activity log
    this.addActivity("⏰ Pairing timeout - no partners available");
  }

  // NEW: Show retry button after timeout
  showRetryButton(retryAfter) {
    const statusSection = document.getElementById("status-section");
    if (!statusSection) return;

    const retryButton = document.createElement("button");
    retryButton.className = "cta-primary large";
    retryButton.textContent = "🔄 Try Again";
    retryButton.style.marginTop = "15px";

    retryButton.addEventListener("click", () => {
      this.logger.info("DashboardController: Retry search after timeout");
      // Re-trigger the last search mode
      if (this.currentMode === "text") {
        this.startTextChat();
      } else {
        this.startVideoChat();
      }
    });

    statusSection
      .querySelector(".searching-animation")
      .appendChild(retryButton);
  }

  handlePeerDisconnected() {
    this.logger.info("DashboardController: Handling peer disconnection");

    this.isInSession = false;
    this.currentMode = null;

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
    this.currentMode = null;

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
  showSearchingState(mode) {
    const statusSection = document.getElementById("status-section");
    const videoBtn = document.getElementById("start-video-chat");
    const textBtn = document.getElementById("start-text-chat");
    const findPartnerBtn = document.getElementById("find-partner-btn");

    if (statusSection) statusSection.style.display = "block";

    // Disable appropriate buttons based on mode
    if (videoBtn) {
      videoBtn.disabled = true;
      if (mode === "video") {
        videoBtn.textContent = "Searching...";
      }
    }

    if (textBtn) {
      textBtn.disabled = true;
      if (mode === "text") {
        textBtn.textContent = "Searching...";
      }
    }

    if (findPartnerBtn) {
      findPartnerBtn.disabled = true;
      findPartnerBtn.textContent = "Searching...";
    }

    this.updateCallStatus(
      `Searching for ${mode} study partner...`,
      "searching"
    );
  }

  hideSearchingState() {
    const statusSection = document.getElementById("status-section");
    const videoBtn = document.getElementById("start-video-chat");
    const textBtn = document.getElementById("start-text-chat");
    const findPartnerBtn = document.getElementById("find-partner-btn");

    if (statusSection) statusSection.style.display = "none";

    // Reset all buttons
    if (videoBtn) {
      videoBtn.disabled = false;
      videoBtn.textContent = "Start Video Chat";
    }

    if (textBtn) {
      textBtn.disabled = false;
      textBtn.textContent = "Start Text Chat";
    }

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

  // NEW METHOD: Add activity to recent activity list
  addActivity(message) {
    const activityList = document.getElementById("activity-list");
    if (!activityList) return;

    const activityItem = document.createElement("div");
    activityItem.className = "activity-item";
    activityItem.innerHTML = `
        <span class="activity-icon">${this.getActivityIcon(message)}</span>
        <span>${message}</span>
    `;

    // Add to top of list
    activityList.insertBefore(activityItem, activityList.firstChild);

    // Keep only last 5 activities
    while (activityList.children.length > 5) {
      activityList.removeChild(activityList.lastChild);
    }

    // Save to localStorage
    this.saveActivity(message);
  }

  // NEW METHOD: Get appropriate icon for activity
  getActivityIcon(message) {
    if (message.includes("video")) return "🎥";
    if (message.includes("text")) return "💬";
    if (message.includes("searching")) return "🔍";
    if (message.includes("Queue")) return "📊";
    if (message.includes("Matched")) return "✅";
    if (message.includes("Connected")) return "✅";
    if (message.includes("Waiting")) return "👋";
    if (message.includes("timeout")) return "⏰";
    return "🕒";
  }

  // NEW METHOD: Save activity to localStorage
  saveActivity(message) {
    try {
      const activities = JSON.parse(
        localStorage.getItem("userActivities") || "[]"
      );
      activities.unshift({
        message,
        timestamp: new Date().toISOString(),
      });

      // Keep only last 10 activities
      if (activities.length > 10) {
        activities.pop();
      }

      localStorage.setItem("userActivities", JSON.stringify(activities));
    } catch (error) {
      this.logger.error("DashboardController: Error saving activity", error);
    }
  }

  // NEW METHOD: Load activities from localStorage
  loadActivities() {
    try {
      const activities = JSON.parse(
        localStorage.getItem("userActivities") || "[]"
      );
      const activityList = document.getElementById("activity-list");

      if (!activityList) return;

      // Clear existing activities except the default one
      const defaultItem = activityList.querySelector(".activity-item");
      activityList.innerHTML = "";

      if (defaultItem) {
        activityList.appendChild(defaultItem);
      }

      // Add saved activities
      activities.forEach((activity) => {
        const activityItem = document.createElement("div");
        activityItem.className = "activity-item";
        activityItem.innerHTML = `
          <span class="activity-icon">${this.getActivityIcon(
            activity.message
          )}</span>
          <span>${activity.message}</span>
        `;
        activityList.appendChild(activityItem);
      });

      this.logger.debug("DashboardController: Activities loaded", {
        count: activities.length,
      });
    } catch (error) {
      this.logger.error("DashboardController: Error loading activities", error);
    }
  }

  // NEW METHOD: Update stats
  updateStats() {
    try {
      // Load stats from localStorage or set defaults
      const stats = JSON.parse(localStorage.getItem("userStats") || "{}");

      const sessionCount = document.getElementById("session-count");
      const partnerCount = document.getElementById("partner-count");
      const rating = document.getElementById("rating");

      if (sessionCount) sessionCount.textContent = stats.sessions || 0;
      if (partnerCount) partnerCount.textContent = stats.partners || 0;
      if (rating) rating.textContent = stats.rating || "5.0";

      this.logger.debug("DashboardController: Stats updated", stats);
    } catch (error) {
      this.logger.error("DashboardController: Error updating stats", error);
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
    this.currentMode = null;

    // Clear any intervals
    if (this.encouragementInterval) {
      clearInterval(this.encouragementInterval);
      this.encouragementInterval = null;
    }

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
