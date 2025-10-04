// videoChatApp.js - UPDATED VERSION
class VideoChatApp {
  constructor() {
    this.socket = null;
    this.videoManager = null;
    this.chatManager = null;
    this.partner = null;
    this.isVideoCallActive = false;

    this.initializeApp();
  }

  initializeApp() {
    console.log("VideoChatApp: Initializing application");

    // Check HTTPS for camera access
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      this.showError(
        "Camera access requires HTTPS. Please use a secure connection."
      );
      return;
    }

    this.connectSocket();
    this.setupEventListeners();
    this.initializeManagers();
  }

  connectSocket() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      this.showError("Not authenticated. Please login again.");
      window.location.href = "/login";
      return;
    }

    this.socket = io("https://pu-c.onrender.com", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    this.setupSocketEvents();
  }

  setupSocketEvents() {
    this.socket.on("connected", (data) => {
      console.log("VideoChatApp: Connected to server", data);
      this.updateStatus("Connected - Waiting for partner...", "waiting");
    });

    this.socket.on("user_paired", (data) => {
      console.log("VideoChatApp: User paired", data);
      this.handleUserPaired(data);
    });

    this.socket.on("signal", (data) => {
      this.handleSignal(data);
    });

    this.socket.on("user_unpaired", (data) => {
      this.handleUserUnpaired(data);
    });

    this.socket.on("video-error", (data) => {
      this.showError(data.message);
    });

    this.socket.on("video:warning", (data) => {
      this.showWarning(data.message);
    });

    this.socket.on("video:connected", () => {
      this.updateStatus("Video call connected!", "connected");
    });

    this.socket.on("error", (data) => {
      this.showError(data.message);
    });

    this.socket.on("disconnect", (reason) => {
      this.handleDisconnect(reason);
    });
  }

  async handleUserPaired(data) {
    this.partner = data.pairedWith;
    this.updateStatus(`Connected with: ${this.partner.email}`, "connected");
    this.addSystemMessage(`You're now connected with ${this.partner.email}!`);

    // Enable chat
    this.enableChatInput();

    // Initialize video call
    await this.initializeVideoCall();
  }

  async initializeVideoCall() {
    try {
      console.log("VideoChatApp: Initializing video call");

      const localVideo = document.getElementById("localVideo");
      const remoteVideo = document.getElementById("remoteVideo");

      if (!localVideo || !remoteVideo) {
        throw new Error("Video elements not found");
      }

      // Create video manager
      this.videoManager = new VideoManager(
        this.socket,
        this.partner.socketId,
        true, // Initiator
        localVideo,
        remoteVideo
      );

      // Initialize video with timeout
      const initPromise = this.videoManager.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Camera initialization timeout")),
          10000
        )
      );

      await Promise.race([initPromise, timeoutPromise]);

      // Start the call
      await this.videoManager.createOffer();

      this.isVideoCallActive = true;
      this.addSystemMessage("Video call started!");
    } catch (error) {
      console.error("VideoChatApp: Failed to initialize video call", error);
      this.showError(
        `Video call failed: ${error.message}. Text chat is still available.`
      );

      // Ensure chat still works even if video fails
      this.enableChatInput();
    }
  }

  handleSignal(data) {
    console.log("VideoChatApp: Handling signal", data.signal.type);

    // Handle chat messages
    if (data.signal.type === "chat_message") {
      this.displayMessage(
        data.signal.message,
        "received",
        data.signal.timestamp
      );
    }
    // Handle typing indicators
    else if (data.signal.type === "typing_start") {
      this.showTypingIndicator();
    } else if (data.signal.type === "typing_end") {
      this.hideTypingIndicator();
    }
    // Handle WebRTC signals
    else if (
      this.videoManager &&
      (data.signal.type === "offer" ||
        data.signal.type === "answer" ||
        data.signal.type === "ice-candidate")
    ) {
      this.videoManager.handleSignal(data.signal);
    }
  }

  handleUserUnpaired(data) {
    this.addSystemMessage("Partner disconnected.");
    this.cleanupCall();
    this.updateStatus(
      "Partner disconnected - Waiting for new partner...",
      "disconnected"
    );
    this.disableChatInput();
  }

  handleDisconnect(reason) {
    this.addSystemMessage("Disconnected from server. Please refresh the page.");
    this.cleanupCall();
    this.updateStatus("Disconnected from server", "error");
    this.disableChatInput();
  }

  setupEventListeners() {
    // Chat events
    document.getElementById("sendButton").addEventListener("click", () => {
      this.sendMessage();
    });

    document
      .getElementById("messageInput")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

    document.getElementById("messageInput").addEventListener("input", () => {
      this.handleTypingStart();
    });

    document.getElementById("messageInput").addEventListener("blur", () => {
      this.handleTypingEnd();
    });

    // Video control events
    document.getElementById("toggleVideo").addEventListener("click", () => {
      this.toggleVideo();
    });

    document.getElementById("toggleAudio").addEventListener("click", () => {
      this.toggleAudio();
    });

    document.getElementById("switchCamera").addEventListener("click", () => {
      this.switchCamera();
    });

    document.getElementById("fullscreenBtn").addEventListener("click", () => {
      this.toggleFullscreen();
    });

    document.getElementById("disconnectBtn").addEventListener("click", () => {
      this.disconnect();
    });
  }

  initializeManagers() {
    // Chat manager will be initialized when we have a partner
    this.chatManager = {
      sendMessage: (message) => {
        if (!this.partner) return;

        this.socket.emit("signal", {
          to: this.partner.socketId,
          signal: {
            type: "chat_message",
            message: message,
            timestamp: Date.now(),
          },
        });
      },
      handleTypingStart: () => {
        if (!this.partner) return;

        this.socket.emit("signal", {
          to: this.partner.socketId,
          signal: {
            type: "typing_start",
            timestamp: Date.now(),
          },
        });
      },
      handleTypingEnd: () => {
        if (!this.partner) return;

        this.socket.emit("signal", {
          to: this.partner.socketId,
          signal: {
            type: "typing_end",
            timestamp: Date.now(),
          },
        });
      },
    };
  }

  sendMessage() {
    if (!this.partner) {
      this.showError("Not connected to a partner");
      return;
    }

    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();

    if (!message) return;

    // Send via chat manager
    this.chatManager.sendMessage(message);

    // Display own message
    this.displayMessage(message, "sent", Date.now());

    // Clear input
    messageInput.value = "";

    // Stop typing indicator
    this.handleTypingEnd();
  }

  displayMessage(message, type, timestamp) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");

    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(message)}</div>
            <div class="message-time">${this.formatTime(timestamp)}</div>
        `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  addSystemMessage(message) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");

    messageDiv.className = "message system";
    messageDiv.textContent = message;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  handleTypingStart() {
    if (!this.partner) return;
    this.chatManager.handleTypingStart();
  }

  handleTypingEnd() {
    if (!this.partner) return;
    this.chatManager.handleTypingEnd();
  }

  showTypingIndicator() {
    const typingIndicator = document.getElementById("typingIndicator");
    typingIndicator.style.display = "block";
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById("typingIndicator");
    typingIndicator.style.display = "none";
  }

  async toggleVideo() {
    if (!this.videoManager) return;

    const isEnabled = this.videoManager.toggleVideo();
    const button = document.getElementById("toggleVideo");

    if (isEnabled) {
      button.classList.add("active");
      button.classList.remove("muted");
    } else {
      button.classList.remove("active");
      button.classList.add("muted");
    }
  }

  async toggleAudio() {
    if (!this.videoManager) return;

    const isEnabled = this.videoManager.toggleAudio();
    const button = document.getElementById("toggleAudio");

    if (isEnabled) {
      button.classList.add("active");
      button.classList.remove("muted");
    } else {
      button.classList.remove("active");
      button.classList.add("muted");
    }
  }

  async switchCamera() {
    // This would require additional implementation for multiple cameras
    this.showError("Camera switching not implemented in this version");
  }

  toggleFullscreen() {
    const videoContainer = document.querySelector(".video-container");

    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  enableChatInput() {
    document.getElementById("messageInput").disabled = false;
    document.getElementById("sendButton").disabled = false;
    document.getElementById("messageInput").placeholder =
      "Type your message...";
  }

  disableChatInput() {
    document.getElementById("messageInput").disabled = true;
    document.getElementById("sendButton").disabled = true;
    document.getElementById("messageInput").placeholder = "Not connected...";
  }

  updateStatus(status, type) {
    const statusElement = document.getElementById("connectionStatus");
    statusElement.textContent = status;
    statusElement.className = `status ${type}`;
  }

  cleanupCall() {
    if (this.videoManager) {
      this.videoManager.cleanup();
      this.videoManager = null;
    }

    this.partner = null;
    this.isVideoCallActive = false;

    // Show overlays
    document.getElementById("local-overlay").style.display = "flex";
    document.getElementById("remote-overlay").style.display = "flex";

    // Reset control buttons
    document.getElementById("toggleVideo").classList.add("active");
    document.getElementById("toggleVideo").classList.remove("muted");
    document.getElementById("toggleAudio").classList.add("active");
    document.getElementById("toggleAudio").classList.remove("muted");
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.cleanupCall();
    window.location.href = "/dashboard";
  }

  showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  showWarning(message) {
    const warningDiv = document.createElement("div");
    warningDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ffc107;
      color: #856404;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 1000;
      text-align: center;
      max-width: 80%;
    `;
    warningDiv.textContent = `⚠️ ${message}`;
    document.body.appendChild(warningDiv);

    setTimeout(() => {
      warningDiv.remove();
    }, 5000);
  }
}

// Initialize the app when page loads
document.addEventListener("DOMContentLoaded", () => {
  new VideoChatApp();
});
