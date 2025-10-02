class ChatManager {
  constructor() {
    this.socket = null;
    this.partner = null;
    this.isConnected = false;
    this.typingTimer = null;

    this.initializeChat();
  }

  initializeChat() {
    this.setupEventListeners();
    this.connectSocket();
    this.showChatInterface();
  }

  connectSocket() {
    const token = localStorage.getItem("authToken");
    if (!token) {
      this.showError("Not authenticated. Please login again.");
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
      console.log("Connected to server:", data);
      this.updateStatus("Connected - Waiting for partner...", "waiting");
    });

    this.socket.on("user_paired", (data) => {
      this.partner = data.pairedWith;
      this.isConnected = true;
      this.updateStatus(
        `Connected with: ${data.pairedWith.email}`,
        "connected"
      );
      this.addSystemMessage(
        `You're now connected with ${data.pairedWith.email}! Start chatting.`
      );
      this.enableChatInput();
    });

    this.socket.on("signal", (data) => {
      if (data.signal.type === "chat_message") {
        this.displayMessage(
          data.signal.message,
          "received",
          data.signal.timestamp
        );
      } else if (data.signal.type === "typing_start") {
        this.showTypingIndicator();
      } else if (data.signal.type === "typing_end") {
        this.hideTypingIndicator();
      }
    });

    this.socket.on("user_unpaired", (data) => {
      this.isConnected = false;
      this.partner = null;
      this.updateStatus(
        "Partner disconnected - Waiting for new partner...",
        "disconnected"
      );
      this.addSystemMessage("Your partner has disconnected.");
      this.disableChatInput();
    });

    this.socket.on("message_sent", (data) => {
      console.log("Message sent confirmation:", data);
    });

    this.socket.on("error", (data) => {
      this.showError(data.message);
    });

    this.socket.on("disconnect", (reason) => {
      this.updateStatus("Disconnected from server", "error");
      this.addSystemMessage(
        "Disconnected from server. Please refresh the page."
      );
      this.disableChatInput();
    });
  }

  setupEventListeners() {
    // Send message button
    document.getElementById("sendButton").addEventListener("click", () => {
      this.sendMessage();
    });

    // Message input enter key
    document
      .getElementById("messageInput")
      .addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

    // Typing indicators
    document.getElementById("messageInput").addEventListener("input", () => {
      this.handleTypingStart();
    });

    document.getElementById("messageInput").addEventListener("blur", () => {
      this.handleTypingEnd();
    });

    // Disconnect button
    document.getElementById("disconnectBtn").addEventListener("click", () => {
      this.disconnect();
    });
  }

  sendMessage() {
    if (!this.isConnected || !this.partner) {
      this.showError("Not connected to a partner");
      return;
    }

    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();

    if (!message) return;

    // Send signal to partner
    this.socket.emit("signal", {
      to: this.partner.socketId,
      signal: {
        type: "chat_message",
        message: message,
        timestamp: Date.now(),
      },
    });

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
    if (!this.isConnected || !this.partner) return;

    // Clear existing timer
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }

    // Send typing start signal
    this.socket.emit("signal", {
      to: this.partner.socketId,
      signal: {
        type: "typing_start",
        timestamp: Date.now(),
      },
    });

    // Set timer to send typing end after 2 seconds of inactivity
    this.typingTimer = setTimeout(() => {
      this.handleTypingEnd();
    }, 2000);
  }

  handleTypingEnd() {
    if (!this.isConnected || !this.partner) return;

    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }

    this.socket.emit("signal", {
      to: this.partner.socketId,
      signal: {
        type: "typing_end",
        timestamp: Date.now(),
      },
    });

    this.hideTypingIndicator();
  }

  showTypingIndicator() {
    const typingIndicator = document.getElementById("typingIndicator");
    typingIndicator.style.display = "block";
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById("typingIndicator");
    typingIndicator.style.display = "none";
  }

  updateStatus(status, type) {
    const statusElement = document.getElementById("connectionStatus");
    statusElement.textContent = status;
    statusElement.className = `status ${type}`;
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

  showChatInterface() {
    // Show chat container and hide loading
    document.getElementById("chatContainer").style.display = "block";
    document.getElementById("loadingIndicator").style.display = "none";
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    window.location.href = "/dashboard";
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
}

// Initialize chat when page loads
document.addEventListener("DOMContentLoaded", () => {
  new ChatManager();
});
