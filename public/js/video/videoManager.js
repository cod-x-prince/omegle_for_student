class VideoManager {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.isInitiator = false;
    this.iceCandidates = [];
  }

  // Initialize video call
  async initializeCall(peerId, isInitiator) {
    try {
      this.peerId = peerId;
      this.isInitiator = isInitiator;

      // Get user media
      await this.getUserMedia();

      // Setup peer connection
      this.setupPeerConnection();

      // Create offer if initiator
      if (isInitiator) {
        await this.createOffer();
      }

      return true;
    } catch (error) {
      console.error("Error initializing call:", error);
      this.handleError("Failed to initialize video call");
      return false;
    }
  }

  // Get user media (camera and microphone)
  async getUserMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Display local video
      const localVideo = document.getElementById("local-video");
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw new Error("Camera/microphone access denied or not available");
    }
  }

  // Setup RTCPeerConnection
  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Add local tracks to connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Setup event handlers
    this.setupConnectionHandlers();
  }

  // Setup connection event handlers
  setupConnectionHandlers() {
    // Handle incoming tracks
    this.peerConnection.ontrack = (event) => {
      console.log("Received remote stream");
      this.remoteStream = event.streams[0];

      const remoteVideo = document.getElementById("remote-video");
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: "ice-candidate",
          candidate: event.candidate,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection.connectionState);

      switch (this.peerConnection.connectionState) {
        case "connected":
          this.handleCallConnected();
          break;
        case "disconnected":
        case "failed":
          this.handleCallFailed();
          break;
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state:",
        this.peerConnection.iceConnectionState
      );
    };
  }

  // Create and send offer
  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.sendSignal({
        type: "offer",
        sdp: offer,
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }

  // Handle incoming offer
  async handleOffer(offer) {
    try {
      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.sendSignal({
        type: "answer",
        sdp: answer,
      });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }

  // Handle incoming answer
  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(answer);

      // Add any stored ICE candidates
      this.iceCandidates.forEach((candidate) => {
        this.peerConnection.addIceCandidate(candidate);
      });
      this.iceCandidates = [];
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }

  // Handle ICE candidate
  async handleICECandidate(candidate) {
    try {
      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        // Store candidate if remote description not set yet
        this.iceCandidates.push(candidate);
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }

  // Send signaling message
  sendSignal(signal) {
    if (window.socket && this.peerId) {
      window.socket.emit("signal", {
        to: this.peerId,
        signal: signal,
        type: "webrtc",
      });
    }
  }

  // Handle successful call connection
  handleCallConnected() {
    // Update UI to show call is connected
    const statusElement = document.getElementById("call-status");
    if (statusElement) {
      statusElement.textContent = "Connected";
      statusElement.className = "status-connected";
    }
  }

  // Handle call failure
  handleCallFailed() {
    this.handleError("Call disconnected unexpectedly");
  }

  // Error handling
  handleError(message) {
    console.error("Video call error:", message);

    // Show error to user
    const errorElement = document.getElementById("error-message");
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = "block";
    }
  }

  // Cleanup resources
  cleanup() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.iceCandidates = [];
  }

  // Toggle video
  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }

  // Toggle audio
  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }
}

// Export for use in other modules
window.VideoManager = VideoManager;
