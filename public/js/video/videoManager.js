class VideoManager {
  constructor(socket, peerId, isInitiator, localVideoEl, remoteVideoEl) {
    console.log("VideoManager: Initializing", {
      peerId,
      isInitiator,
      hasLocalVideo: !!localVideoEl,
      hasRemoteVideo: !!remoteVideoEl,
      hasSocket: !!socket,
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

    // STUN servers for NAT traversal
    this.rtcConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    // Track connection state
    this.connectionState = "new";
    this.iceConnectionState = "new";

    console.log("VideoManager: Constructor completed");
  }

  async initialize() {
    if (this.isInitialized) {
      console.warn("VideoManager: Already initialized");
      return;
    }

    console.log("VideoManager: Starting initialization");

    try {
      // 1. Get user's camera and microphone
      console.log("VideoManager: Requesting media devices");
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log("VideoManager: Media stream obtained", {
        videoTracks: this.localStream.getVideoTracks().length,
        audioTracks: this.localStream.getAudioTracks().length,
      });

      // 2. Set up local video element
      if (this.localVideoEl) {
        this.localVideoEl.srcObject = this.localStream;
        this.localVideoEl.muted = true; // Mute local video to avoid feedback
        this.localVideoEl.playsInline = true;

        this.localVideoEl.onloadedmetadata = () => {
          console.log("VideoManager: Local video metadata loaded");
          this.localVideoEl.play().catch((error) => {
            console.error("VideoManager: Failed to play local video", error);
          });
        };

        this.localVideoEl.onerror = (error) => {
          console.error("VideoManager: Local video error", error);
        };
      }

      // 3. Create the RTCPeerConnection
      this.setupPeerConnection();

      console.log("VideoManager: Initialization completed successfully");
      this.isInitialized = true;
    } catch (error) {
      console.error("VideoManager: Initialization failed", {
        error: error.message,
        name: error.name,
      });

      this.handleError(
        "Failed to access camera/microphone. Please check permissions."
      );
      throw error;
    }
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

          // Set up remote video element
          if (this.remoteVideoEl) {
            this.remoteVideoEl.srcObject = this.remoteStream;
            this.remoteVideoEl.playsInline = true;

            this.remoteVideoEl.onloadedmetadata = () => {
              console.log("VideoManager: Remote video metadata loaded");
              this.remoteVideoEl.play().catch((error) => {
                console.error(
                  "VideoManager: Failed to play remote video",
                  error
                );
              });

              // Hide waiting overlay when remote video loads
              const remoteOverlay = document.getElementById("remote-overlay");
              if (remoteOverlay) {
                remoteOverlay.style.display = "none";
              }
            };

            this.remoteVideoEl.onerror = (error) => {
              console.error("VideoManager: Remote video error", error);
            };
          }

          // Listen for track ended events
          event.track.onended = () => {
            console.log("VideoManager: Remote track ended", {
              kind: event.track.kind,
            });
          };
        }
      };

      // Event handler for ICE connection state changes
      this.peerConnection.oniceconnectionstatechange = () => {
        const newState = this.peerConnection.iceConnectionState;
        console.log("VideoManager: ICE connection state changed", {
          from: this.iceConnectionState,
          to: newState,
        });

        this.iceConnectionState = newState;

        if (newState === "connected") {
          console.log("VideoManager: Peer connection established!");
        } else if (newState === "failed" || newState === "disconnected") {
          console.error("VideoManager: Peer connection failed or disconnected");
          this.handleError("Connection lost. Please try again.");
        }
      };

      // Event handler for connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        const newState = this.peerConnection.connectionState;
        console.log("VideoManager: Connection state changed", {
          from: this.connectionState,
          to: newState,
        });

        this.connectionState = newState;
      };

      // Event handler for network candidates
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

      console.log("VideoManager: Peer connection setup completed");
    } catch (error) {
      console.error("VideoManager: Peer connection setup failed", error);
      throw error;
    }
  }

  async createOffer() {
    try {
      console.log("VideoManager: Creating offer");

      const offer = await this.peerConnection.createOffer();
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
        const answer = await this.peerConnection.createAnswer();
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

    // Show waiting overlay again
    const remoteOverlay = document.getElementById("remote-overlay");
    if (remoteOverlay) {
      remoteOverlay.style.display = "flex";
    }

    this.isInitialized = false;
    console.log("VideoManager: Cleanup completed");
  }

  toggleVideo() {
    if (!this.localStream) {
      console.warn("VideoManager: No local stream available for video toggle");
      return false;
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      const newState = !videoTrack.enabled;
      videoTrack.enabled = newState;

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

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      const newState = !audioTrack.enabled;
      audioTrack.enabled = newState;

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
    };
  }

  handleError(message) {
    console.error("VideoManager: Error occurred", { message });

    // Emit error event that can be handled by the UI
    if (this.socket) {
      this.socket.emit("video-error", { message });
    }

    // Show user-friendly error message
    if (typeof window.showError === "function") {
      window.showError(message);
    } else {
      alert(`Video Error: ${message}`);
    }
  }
}
