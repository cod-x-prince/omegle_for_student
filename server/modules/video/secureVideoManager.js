const logger = require("../../utils/logger");

class SecureVideoManager {
  constructor(socket, peerId = null, isInitiator = false) {
    this.socket = socket;
    this.peerId = peerId;
    this.isInitiator = isInitiator;

    // WebRTC configuration with fallback options
    this.rtcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
      iceTransportPolicy: "all", // Use both relay and direct connections
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    };

    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;

    this.mediaConstraints = {
      video: {
        width: { ideal: 1280, min: 640, max: 1920 },
        height: { ideal: 720, min: 480, max: 1080 },
        frameRate: { ideal: 30, min: 20, max: 60 },
        facingMode: "user", // Use front camera
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
  }

  async initialize() {
    try {
      logger.info("Initializing SecureVideoManager", {
        socketId: this.socket.id,
        peerId: this.peerId,
        isInitiator: this.isInitiator,
      });

      // Initialize peer connection
      this.peerConnection = new RTCPeerConnection(this.rtcConfig);

      // Set up event handlers
      this.setupPeerConnectionEvents();

      // Get user media with progressive fallback
      await this.getUserMediaWithFallback();

      logger.info("SecureVideoManager initialized successfully", {
        hasLocalStream: !!this.localStream,
        hasVideo: this.localStream
          ? this.localStream.getVideoTracks().length > 0
          : false,
        hasAudio: this.localStream
          ? this.localStream.getAudioTracks().length > 0
          : false,
      });

      return true;
    } catch (error) {
      logger.error("Failed to initialize SecureVideoManager", {
        error: error.message,
        socketId: this.socket.id,
        peerId: this.peerId,
      });

      this.socket.emit("video:error", {
        type: "initialization_failed",
        message: "Failed to initialize video call: " + error.message,
      });

      return false;
    }
  }

  async getUserMediaWithFallback() {
    let stream = null;

    try {
      logger.info("Attempting to get user media with ideal constraints");

      // Try ideal constraints first
      stream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
    } catch (idealError) {
      logger.warn("Ideal constraints failed, trying fallback", {
        error: idealError.message,
      });

      try {
        // Try fallback constraints
        stream = await navigator.mediaDevices.getUserMedia(
          this.fallbackConstraints
        );
      } catch (fallbackError) {
        logger.warn("Fallback constraints failed, trying audio only", {
          error: fallbackError.message,
        });

        try {
          // Try audio only
          stream = await navigator.mediaDevices.getUserMedia(
            this.audioOnlyConstraints
          );

          this.socket.emit("video:warning", {
            type: "video_unavailable",
            message: "Video is not available. Continuing with audio only.",
          });
        } catch (audioError) {
          logger.error("All media acquisition attempts failed", {
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

    // Add tracks to peer connection
    if (this.peerConnection) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    logger.info("User media acquired successfully", {
      hasVideo: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });

    return stream;
  }

  setupPeerConnectionEvents() {
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("signal", {
          to: this.peerId,
          signal: {
            type: "candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      logger.info("Remote track received", {
        trackKind: event.track.kind,
        streamCount: event.streams.length,
      });

      this.remoteStream = event.streams[0];

      // Emit event to update UI
      this.socket.emit("video:remote_stream_ready");
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      logger.info("Peer connection state changed", { state: state });

      this.socket.emit("video:connection_state", { state: state });

      if (state === "connected") {
        this.socket.emit("video:call_connected");
      } else if (state === "failed" || state === "disconnected") {
        this.socket.emit("video:call_failed", { state: state });
      }
    };

    this.peerConnection.onsignalingstatechange = () => {
      logger.info("Signaling state changed", {
        state: this.peerConnection.signalingState,
      });
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      logger.info("ICE connection state changed", { state: state });

      this.socket.emit("video:ice_state", { state: state });
    };
  }

  async createOffer() {
    try {
      logger.info("Creating offer");

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit("signal", {
        to: this.peerId,
        signal: offer,
      });

      logger.info("Offer created and sent", { type: offer.type });
    } catch (error) {
      logger.error("Failed to create offer", { error: error.message });
      throw error;
    }
  }

  async handleOffer(offer) {
    try {
      logger.info("Handling offer");

      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.socket.emit("signal", {
        to: this.peerId,
        signal: answer,
      });

      logger.info("Answer created and sent", { type: answer.type });
    } catch (error) {
      logger.error("Failed to handle offer", { error: error.message });
      throw error;
    }
  }

  async handleAnswer(answer) {
    try {
      logger.info("Handling answer");
      await this.peerConnection.setRemoteDescription(answer);
      logger.info("Answer handled successfully");
    } catch (error) {
      logger.error("Failed to handle answer", { error: error.message });
      throw error;
    }
  }

  async handleCandidate(candidate) {
    try {
      logger.debug("Adding ICE candidate");
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      logger.error("Failed to add ICE candidate", { error: error.message });
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        this.isVideoEnabled = !this.isVideoEnabled;
        videoTracks.forEach((track) => {
          track.enabled = this.isVideoEnabled;
        });

        this.socket.emit("video:toggled", {
          type: "video",
          enabled: this.isVideoEnabled,
        });
      }
    }
    return this.isVideoEnabled;
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.isAudioEnabled = !this.isAudioEnabled;
        audioTracks.forEach((track) => {
          track.enabled = this.isAudioEnabled;
        });

        this.socket.emit("video:toggled", {
          type: "audio",
          enabled: this.isAudioEnabled,
        });
      }
    }
    return this.isAudioEnabled;
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  cleanup() {
    logger.info("Cleaning up SecureVideoManager");

    // Stop all media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;

    logger.info("SecureVideoManager cleanup completed");
  }

  getStatus() {
    return {
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      isVideoEnabled: this.isVideoEnabled,
      isAudioEnabled: this.isAudioEnabled,
      connectionState: this.peerConnection
        ? this.peerConnection.connectionState
        : "disconnected",
      iceState: this.peerConnection
        ? this.peerConnection.iceConnectionState
        : "disconnected",
    };
  }
}

module.exports = SecureVideoManager;
