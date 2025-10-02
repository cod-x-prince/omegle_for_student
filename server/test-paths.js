// test-paths.js - Run this from C:\Omegle\server
require("dotenv").config();
console.log("🔍 Testing all module paths from server directory...");

const pathsToTest = [
  "./utils/logger", // ← Fixed paths
  "./modules/auth/authMiddleware",
  "./modules/pairing/pairingManager",
  "./modules/signaling/signalingHandler",
];

console.log("Testing paths relative to:", process.cwd());

pathsToTest.forEach((path) => {
  try {
    const module = require(path);
    console.log(`✅ ${path} - LOADED`);
  } catch (error) {
    console.log(`❌ ${path} - FAILED: ${error.message}`);
  }
});

console.log("🎉 Path testing completed");
