// debug-server.js - RUN FROM PROJECT ROOT (C:\Omegle)
require("dotenv").config();
console.log("🚀 Debugging server startup...");
console.log("Current directory:", process.cwd());

try {
  console.log("1. Testing express...");
  const express = require("express");

  console.log("2. Testing security config...");
  const securityConfig = require("./server/config/security");

  console.log("3. Testing constants...");
  const constants = require("./server/config/constants");

  console.log("4. Testing logger...");
  const logger = require("./server/utils/logger");

  console.log("5. Testing auth middleware...");
  const authMiddleware = require("./server/modules/auth/authMiddleware");

  console.log("6. Testing pairing manager...");
  const PairingManager = require("./server/modules/pairing/pairingManager");

  console.log("7. Testing signaling handler...");
  const SignalingHandler = require("./server/modules/signaling/signalingHandler");

  console.log("✅ All modules loaded successfully!");
  console.log("🎯 Starting actual server...");

  // Now start the actual server
  require("./server/server.js");
} catch (error) {
  console.error("❌ Module loading failed:", error.message);
  console.error("Stack:", error.stack);
  process.exit(1);
}
