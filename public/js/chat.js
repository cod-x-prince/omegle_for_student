// In public/js/chat.js

class ChatPage {
  constructor() {
    console.log("ChatPage: Starting initialization...");

    this.socket = null;
    this.videoManager = null;
    this.authManager = new AuthManager();
    this.isInitialized = false;

    this.initializeApp();
  }

  async initializeApp() {
    try {
      console.log("ChatPage: Starting app initialization...");

      // 1. Check if user is logged in
      if (!this.authManager.isAuthenticated()) {
        console.log("ChatPage: User not authenticated, redirecting to login");
        window.location.href = "/login.html";
        return;
      }

      console.log("ChatPage: User authenticated successfully");

      // 2. Get pairing data from session storage
      const pairingData = this.getPairingData();
      if (!pairingData) {
        console.error("ChatPage: No pairing data found in session storage");
        this.showError("No pairing information found. Returning to homepage.");
        setTimeout(() => {
          window.location.href = "/";
        }, 3000);
        return;
      }

      console.log("ChatPage: Pairing data found:", pairingData);

      // 3. Connect to the server
      this.connectSocket();

      // 4. Wait for socket connection before initializing video
      this.setupSocketEvents().then(() => {
        // 5. Initialize the VideoManager after socket is connected
        this.initializeVideoManager(pairingData);

        // 6. Setup event listeners for UI
        this.setupEventListeners();

        this.isInitialized = true;
        console.log("ChatPage: App initialization completed successfully");
      });
    } catch (error) {
      console.error("ChatPage: Initialization failed", {
        error: error.message,
        stack: error.stack,
      });
      this.showError("Failed to initialize chat. Please try again.");
    }
  }

  getPairingData() {
    try {
      const data = sessionStorage.getItem("cc_pairing_data");
      const parsedData = data ? JSON.parse(data) : null;

      console.log(
        "ChatPage: Retrieved pairing data from session storage",
        parsedData
      );
      return parsedData;
    } catch (error) {
      console.error("ChatPage: Error parsing pairing data", error);
      return null;
    }
  }

  connectSocket() {
    try {
      const token = this.authManager.getToken();
      if (!token) {
        throw new Error("No authentication token available");
      }

      console.log("ChatPage: Connecting socket with token");
      this.socket = io({
        auth: { token },
      });

      window.chatSocket = this.socket; // For debugging
    } catch (error) {
      console.error("ChatPage: Socket connection failed", error);
      throw error;
    }
  }

  setupSocketEvents() {
    return new Promise((resolve) => {
      console.log("ChatPage: Setting up socket events...");

      // Socket connection event
      this.socket.on("connect", () => {
        console.log("ChatPage: Socket connected successfully", {
          socketId: this.socket.id,
        });
        resolve();
      });

      // Signaling events for WebRTC
      this.socket.on("signal", (data) => {
        console.log("ChatPage: Signal received:", {
          type: data.signal?.type,
          from: data.from,
        });

        if (this.videoManager) {
          this.videoManager.handleSignal(data.signal);
        } else {
          console.warn("ChatPage: VideoManager not ready for signal");
        }
      });

      // Peer disconnected event
      this.socket.on("peer-disconnected", () => {
        console.log("ChatPage: Peer disconnected event received");
        this.showMessage(
          "Your partner has disconnected. Returning to homepage."
        );
        setTimeout(() => {
          this.cleanupAndRedirect();
        }, 3000);
      });

      // Socket error events
      this.socket.on("error", (error) => {
        console.error("ChatPage: Socket error", error);
        this.showError(
          "Connection error: " + (error.message || "Unknown error")
        );
      });

      // Socket disconnect event
      this.socket.on("disconnect", (reason) => {
        console.log("ChatPage: Socket disconnected", { reason });

        if (reason === "io server disconnect") {
          this.showError("Server disconnected. Please log in again.");
          setTimeout(() => {
            this.authManager.logout();
          }, 2000);
        }
      });

      // Connection timeout
      this.socket.on("connect_timeout", () => {
        console.error("ChatPage: Socket connection timeout");
        this.showError("Connection timeout. Please check your internet.");
      });

      console.log("ChatPage: Socket event handlers registered");
    });
  }

  initializeVideoManager(pairingData) {
    try {
      console.log("ChatPage: Initializing VideoManager...");

      const localVideoEl = document.getElementById("local-video");
      const remoteVideoEl = document.getElementById("remote-video");

      console.log("ChatPage: Video elements found:", {
        localVideo: !!localVideoEl,
        remoteVideo: !!remoteVideoEl,
      });

      if (!localVideoEl || !remoteVideoEl) {
        throw new Error("Required video elements not found");
      }

      this.videoManager = new VideoManager(
        this.socket,
        pairingData.peerId,
        pairingData.initiator,
        localVideoEl,
        remoteVideoEl
      );

      // Initialize video call
      this.videoManager
        .initialize()
        .then(() => {
          console.log("ChatPage: VideoManager initialized successfully");
        })
        .catch((error) => {
          console.error("ChatPage: VideoManager initialization failed", error);
          this.showError("Failed to start video call: " + error.message);
        });
    } catch (error) {
      console.error("ChatPage: VideoManager creation failed", error);
      this.showError("Failed to setup video: " + error.message);
      throw error;
    }
  }

  setupEventListeners() {
    console.log("ChatPage: Setting up UI event listeners...");

    // UI Button events with debugging
    const disconnectBtn = document.getElementById("disconnect-btn");
    const videoBtn = document.getElementById("toggle-video");
    const audioBtn = document.getElementById("toggle-audio");
    const fullscreenBtn = document.getElementById("fullscreen-btn");

    console.log("ChatPage: Button elements found:", {
      disconnectBtn: !!disconnectBtn,
      videoBtn: !!videoBtn,
      audioBtn: !!audioBtn,
      fullscreenBtn: !!fullscreenBtn,
    });

    // Disconnect button
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => {
        console.log("ChatPage: Disconnect button clicked");
        this.cleanupAndRedirect();
      });
    } else {
      console.error("ChatPage: Disconnect button not found!");
    }

    // Toggle video button
    if (videoBtn) {
      videoBtn.addEventListener("click", () => {
        console.log("ChatPage: Toggle video button clicked");
        if (this.videoManager) {
          const newState = this.videoManager.toggleVideo();
          videoBtn.textContent = newState ? "📹 Video On" : "📹 Video Off";
          videoBtn.classList.toggle("active", newState);
        }
      });
    } else {
      console.error("ChatPage: Toggle video button not found!");
    }

    // Toggle audio button
    if (audioBtn) {
      audioBtn.addEventListener("click", () => {
        console.log("ChatPage: Toggle audio button clicked");
        if (this.videoManager) {
          const newState = this.videoManager.toggleAudio();
          audioBtn.textContent = newState ? "🎤 Audio On" : "🎤 Audio Off";
          audioBtn.classList.toggle("active", newState);
        }
      });
    } else {
      console.error("ChatPage: Toggle audio button not found!");
    }

    // Fullscreen button
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", () => {
        console.log("ChatPage: Fullscreen button clicked");
        this.toggleFullscreen();
      });
    }

    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      console.log("ChatPage: Page visibility changed", {
        hidden: document.hidden,
      });
    });

    // Handle beforeunload
    window.addEventListener("beforeunload", () => {
      console.log("ChatPage: Page unloading, cleaning up...");
      this.cleanup();
    });

    console.log("ChatPage: UI event listeners setup completed");
  }

  toggleFullscreen() {
    const videoContainer = document.querySelector(".video-container");
    if (!videoContainer) return;

    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch((err) => {
        console.error("ChatPage: Fullscreen request failed", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  showMessage(message) {
    console.log("ChatPage: Showing message to user", { message });

    // Create or update message display
    let messageDiv = document.getElementById("chat-message");
    if (!messageDiv) {
      messageDiv = document.createElement("div");
      messageDiv.id = "chat-message";
      messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 1000;
        text-align: center;
      `;
      document.body.appendChild(messageDiv);
    }

    messageDiv.textContent = message;
    messageDiv.style.display = "block";

    // Auto-hide after 5 seconds
    setTimeout(() => {
      messageDiv.style.display = "none";
    }, 5000);
  }

  showError(message) {
    console.error("ChatPage: Showing error message", { message });
    this.showMessage(`❌ ${message}`);
  }

  cleanup() {
    console.log("ChatPage: Cleaning up resources...");

    if (this.videoManager) {
      this.videoManager.cleanup();
    }

    if (this.socket) {
      this.socket.disconnect();
    }
  }

  cleanupAndRedirect() {
    console.log("ChatPage: Cleaning up and redirecting to homepage...");

    this.cleanup();
    sessionStorage.removeItem("cc_pairing_data");
    window.location.href = "/";
  }

  // Method to get current status for debugging
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasSocket: !!this.socket,
      socketConnected: this.socket?.connected,
      hasVideoManager: !!this.videoManager,
      videoManagerStatus: this.videoManager?.getConnectionStatus(),
    };
  }
}

// Initialize the chat page logic
document.addEventListener("DOMContentLoaded", () => {
  console.log("ChatPage: DOM loaded, initializing chat page...");

  // Add some basic styles for messages
  const style = document.createElement("style");
  style.textContent = `
    .active {
      background-color: #4CAF50 !important;
    }
  `;
  document.head.appendChild(style);

  window.chatPage = new ChatPage();
});

// Export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = ChatPage;
}
