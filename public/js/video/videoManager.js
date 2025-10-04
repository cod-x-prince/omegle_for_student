// videoManager.js - ENHANCED VERSION WITH BETTER ERROR HANDLING
class VideoManager {
  constructor(socket, peerId, isInitiator, localVideoEl, remoteVideoEl) {
    console.log("VideoManager: Initializing", {
      peerId,
      isInitiator,
      hasLocalVideo: !!localVideoEl,
      hasRemoteVideo: !!remoteVideoEl,
    });

    this.socket = socket;
    this.peerId = peerId;
    this.isInitiator = isInitiator;
    this.localVideoEl = localVideoEl;
    this.remoteVideoEl = remoteVideoEl;

    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isInitialized = false;

    // Enhanced STUN servers with fallbacks
    this.rtcConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };

    // Progressive constraints for better compatibility
    this.constraints = {
      video: {
        width: { ideal: 1280, min: 640, max: 1920 },
        height: { ideal: 720, min: 480, max: 1080 },
        frameRate: { ideal: 30, min: 20, max: 60 },
        facingMode: "user",
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
      },
    };

    this.fallbackConstraints = {
      video: {
        width: { min: 320, ideal: 640 },
        height: { min: 240, ideal: 480 },
        frameRate: { min: 15, ideal: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    };

    this.audioOnlyConstraints = {
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };

    this.connectionState = "new";
    this.iceConnectionState = "new";
  }

  async initialize() {
    if (this.isInitialized) {
      console.warn("VideoManager: Already initialized");
      return;
    }

    console.log(
      "VideoManager: Starting initialization with progressive fallback"
    );

    try {
      // Get user media with progressive fallback
      await this.getUserMediaWithFallback();

      // Create the RTCPeerConnection
      this.setupPeerConnection();

      console.log("VideoManager: Initialization completed successfully");
      this.isInitialized = true;
    } catch (error) {
      console.error("VideoManager: Initialization failed", {
        error: error.message,
        name: error.name,
      });

      this.handleError(
        `Camera/Microphone Error: ${error.message}. Please check permissions and ensure you're using HTTPS.`
      );
      throw error;
    }
  }

  async getUserMediaWithFallback() {
    let stream = null;

    try {
      console.log("VideoManager: Attempting ideal constraints");
      stream = await navigator.mediaDevices.getUserMedia(this.constraints);
    } catch (idealError) {
      console.warn("VideoManager: Ideal constraints failed, trying fallback", {
        error: idealError.message,
      });

      try {
        console.log("VideoManager: Trying fallback constraints");
        stream = await navigator.mediaDevices.getUserMedia(
          this.fallbackConstraints
        );
      } catch (fallbackError) {
        console.warn(
          "VideoManager: Fallback constraints failed, trying audio only",
          {
            error: fallbackError.message,
          }
        );

        try {
          console.log("VideoManager: Trying audio only");
          stream = await navigator.mediaDevices.getUserMedia(
            this.audioOnlyConstraints
          );

          // Notify about audio-only mode
          if (this.socket) {
            this.socket.emit("video:warning", {
              type: "video_unavailable",
              message: "Video is not available. Continuing with audio only.",
            });
          }
        } catch (audioError) {
          console.error("VideoManager: All media acquisition attempts failed", {
            idealError: idealError.message,
            fallbackError: fallbackError.message,
            audioError: audioError.message,
          });

          throw new Error(
            `Cannot access camera or microphone: ${audioError.message}`
          );
        }
      }
    }

    this.localStream = stream;

    console.log("VideoManager: Media stream obtained", {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    // Set up local video element
    if (this.localVideoEl) {
      this.setupVideoElement(this.localVideoEl, stream, true);
    }

    return stream;
  }

  setupVideoElement(videoEl, stream, isLocal = false) {
    videoEl.srcObject = stream;
    videoEl.muted = isLocal;
    videoEl.playsInline = true;

    videoEl.onloadedmetadata = () => {
      console.log(
        `VideoManager: ${isLocal ? "Local" : "Remote"} video metadata loaded`
      );
      videoEl.play().catch((error) => {
        console.error(
          `VideoManager: Failed to play ${isLocal ? "local" : "remote"} video`,
          error
        );
      });
    };

    videoEl.onloadeddata = () => {
      console.log(
        `VideoManager: ${isLocal ? "Local" : "Remote"} video data loaded`
      );

      // Hide overlay when video loads
      if (isLocal) {
        const localOverlay = document.getElementById("local-overlay");
        if (localOverlay) localOverlay.style.display = "none";
      }
    };

    videoEl.onerror = (error) => {
      console.error(
        `VideoManager: ${isLocal ? "Local" : "Remote"} video error`,
        error
      );
    };

    // Track ended events
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        console.log(`VideoManager: ${track.kind} track ended`);
      };
    });
  }

  setupPeerConnection() {
    console.log("VideoManager: Setting up peer connection");

    try {
      this.peerConnection = new RTCPeerConnection(this.rtcConfiguration);

      // Add local stream tracks to the connection
      this.localStream.getTracks().forEach((track) => {
        console.log("VideoManager: Adding local track", { kind: track.kind });
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Event handler for when the remote stream arrives
      this.peerConnection.ontrack = (event) => {
        console.log("VideoManager: Remote track received", {
          tracks: event.streams.length,
          kind: event.track.kind,
        });

        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          this.setupVideoElement(this.remoteVideoEl, this.remoteStream, false);

          // Hide remote overlay
          const remoteOverlay = document.getElementById("remote-overlay");
          if (remoteOverlay) remoteOverlay.style.display = "none";
        }
      };

      // Enhanced ICE connection state handling
      this.peerConnection.oniceconnectionstatechange = () => {
        const newState = this.peerConnection.iceConnectionState;
        console.log("VideoManager: ICE connection state changed", {
          from: this.iceConnectionState,
          to: newState,
        });

        this.iceConnectionState = newState;

        if (newState === "connected" || newState === "completed") {
          console.log("VideoManager: Peer connection established!");
          if (this.socket) {
            this.socket.emit("video:connected");
          }
        } else if (newState === "failed" || newState === "disconnected") {
          console.error("VideoManager: Peer connection failed or disconnected");
          this.handleError("Connection lost. Please try again.");
        }
      };

      // Connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        const newState = this.peerConnection.connectionState;
        console.log("VideoManager: Connection state changed", {
          from: this.connectionState,
          to: newState,
        });

        this.connectionState = newState;
      };

      // ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("VideoManager: ICE candidate generated");

          this.socket.emit("signal", {
            to: this.peerId,
            signal: {
              type: "ice-candidate",
              candidate: event.candidate,
            },
          });
        } else {
          console.log("VideoManager: ICE gathering complete");
        }
      };

      // ICE gathering state
      this.peerConnection.onicegatheringstatechange = () => {
        console.log("VideoManager: ICE gathering state", {
          state: this.peerConnection.iceGatheringState,
        });
      };

      console.log("VideoManager: Peer connection setup completed");
    } catch (error) {
      console.error("VideoManager: Peer connection setup failed", error);
      throw error;
    }
  }

  async createOffer() {
    try {
      console.log("VideoManager: Creating offer");

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      console.log("VideoManager: Offer created", { type: offer.type });

      await this.peerConnection.setLocalDescription(offer);
      console.log("VideoManager: Local description set");

      this.socket.emit("signal", {
        to: this.peerId,
        signal: offer,
      });

      console.log("VideoManager: Offer sent to peer");
    } catch (error) {
      console.error("VideoManager: Error creating offer", error);
      throw error;
    }
  }

  async handleSignal(signal) {
    if (!this.peerConnection) {
      console.log("VideoManager: Creating peer connection for incoming signal");
      this.setupPeerConnection();
    }

    console.log("VideoManager: Handling signal", { type: signal.type });

    try {
      if (signal.type === "offer") {
        console.log("VideoManager: Processing offer");
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(signal)
        );

        console.log("VideoManager: Creating answer");
        const answer = await this.peerConnection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        await this.peerConnection.setLocalDescription(answer);

        this.socket.emit("signal", {
          to: this.peerId,
          signal: answer,
        });

        console.log("VideoManager: Answer sent");
      } else if (signal.type === "answer") {
        console.log("VideoManager: Processing answer");
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(signal)
        );
        console.log("VideoManager: Remote description set from answer");
      } else if (signal.type === "ice-candidate") {
        console.log("VideoManager: Processing ICE candidate");
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(signal.candidate)
        );
        console.log("VideoManager: ICE candidate added");
      } else {
        console.warn("VideoManager: Unknown signal type", {
          type: signal.type,
        });
      }
    } catch (error) {
      console.error("VideoManager: Error handling signal", {
        error: error.message,
        signalType: signal.type,
      });
      throw error;
    }
  }

  cleanup() {
    console.log("VideoManager: Cleaning up resources");

    // Stop all media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log("VideoManager: Stopping track", { kind: track.kind });
        track.stop();
      });
      this.localStream = null;
    }

    // Clear video elements
    if (this.localVideoEl) {
      this.localVideoEl.srcObject = null;
    }
    if (this.remoteVideoEl) {
      this.remoteVideoEl.srcObject = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Show waiting overlays again
    const localOverlay = document.getElementById("local-overlay");
    const remoteOverlay = document.getElementById("remote-overlay");
    if (localOverlay) localOverlay.style.display = "flex";
    if (remoteOverlay) remoteOverlay.style.display = "flex";

    this.isInitialized = false;
    console.log("VideoManager: Cleanup completed");
  }

  toggleVideo() {
    if (!this.localStream) {
      console.warn("VideoManager: No local stream available for video toggle");
      return false;
    }

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      const newState = !videoTracks[0].enabled;
      videoTracks.forEach((track) => {
        track.enabled = newState;
      });

      console.log("VideoManager: Video toggled", { enabled: newState });
      return newState;
    }

    console.warn("VideoManager: No video track found");
    return false;
  }

  toggleAudio() {
    if (!this.localStream) {
      console.warn("VideoManager: No local stream available for audio toggle");
      return false;
    }

    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const newState = !audioTracks[0].enabled;
      audioTracks.forEach((track) => {
        track.enabled = newState;
      });

      console.log("VideoManager: Audio toggled", { enabled: newState });
      return newState;
    }

    console.warn("VideoManager: No audio track found");
    return false;
  }

  getConnectionStatus() {
    return {
      connectionState: this.connectionState,
      iceConnectionState: this.iceConnectionState,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      isInitialized: this.isInitialized,
      videoEnabled: this.localStream
        ? this.localStream.getVideoTracks()[0]?.enabled
        : false,
      audioEnabled: this.localStream
        ? this.localStream.getAudioTracks()[0]?.enabled
        : false,
    };
  }

  handleError(message) {
    console.error("VideoManager: Error occurred", { message });

    // Emit error event that can be handled by the UI
    if (this.socket) {
      this.socket.emit("video-error", { message });
    }

    // Show user-friendly error message
    this.showUserError(message);
  }

  showUserError(message) {
    // Create error display
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #dc3545;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 1000;
      text-align: center;
      max-width: 80%;
    `;
    errorDiv.textContent = `❌ ${message}`;
    document.body.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}
