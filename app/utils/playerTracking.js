// Player tracking heartbeat system
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { app } = require("electron");

// Configuration
const TRACKING_API_URL = "https://playertracker-production.up.railway.app";
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// Helper function to detect actual OS version (Windows 10, Windows 11, etc.)
function getOSVersion() {
  const platform = os.platform();
  const release = os.release();
  
  if (platform === "win32") {
    const parts = release.split(".");
    const major = parseInt(parts[0]) || 0;
    const minor = parseInt(parts[1]) || 0;
    const build = parseInt(parts[2]) || 0;
    
    // Windows 10/11 both report as 10.0.x
    // Windows 11 is build 22000+
    if (major === 10 && minor === 0) {
      if (build >= 22000) {
        return "Windows 11";
      } else if (build >= 19041) {
        return "Windows 10";
      } else {
        return "Windows 10";
      }
    } else if (major === 6) {
      // Windows 7/8/8.1 report as 6.x
      if (minor === 1) {
        return "Windows 7";
      } else if (minor === 2) {
        return "Windows 8";
      } else if (minor === 3) {
        return "Windows 8.1";
      } else if (minor === 0) {
        return "Windows Vista";
      } else {
        return `Windows ${major}.${minor}`;
      }
    } else if (major === 5) {
      // Windows XP/2003
      if (minor === 1) {
        return "Windows XP";
      } else if (minor === 2) {
        return "Windows Server 2003";
      } else {
        return `Windows ${major}.${minor}`;
      }
    } else {
      return `Windows ${major}${minor > 0 ? `.${minor}` : ""}`;
    }
  } else if (platform === "darwin") {
    // macOS - parse version from release
    const parts = release.split(".");
    const major = parseInt(parts[0]) || 0;
    const minor = parseInt(parts[1]) || 0;
    // Map macOS versions (simplified)
    if (major >= 22) return "macOS Ventura+";
    if (major >= 21) return "macOS Monterey";
    if (major >= 20) return "macOS Big Sur";
    if (major >= 19) return "macOS Catalina";
    return `macOS ${major}.${minor}`;
  } else if (platform === "linux") {
    // For Linux, try to get distro name if available
    try {
      const distro = fs.readFileSync("/etc/os-release", "utf8");
      const nameMatch = distro.match(/^NAME="?([^"\n]+)"?/m);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
    } catch (e) {
      // Fallback to generic Linux
    }
    return "Linux";
  }
  
  return platform; // Fallback to platform name
}

class PlayerTracker {
  constructor() {
    this.playerId = this.getOrCreatePlayerId();
    this.heartbeatInterval = null;
    this.currentStatus = "menu"; // 'menu', 'in-game', 'downloading', 'installing'
    this.enabled = true;
    this.gameSessionStart = null; // Track when game session started
  }

  getOrCreatePlayerId() {
    const configPath = path.join(app.getPath("userData"), "player-id.json");
    let isNewInstall = false;

    try {
      // Try to read existing player ID
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (data.playerId) {
          this.installReported = data.installReported || false;
          return data.playerId;
        }
      }
    } catch (error) {
      console.warn("[PlayerTracker] Error reading player ID:", error.message);
    }

    // Generate new player ID (first install)
    const { v4: uuidv4 } = require("uuid");
    const playerId = uuidv4();
    isNewInstall = true;
    this.installReported = false;

    try {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            playerId,
            installReported: false,
            firstInstall: new Date().toISOString(),
          },
          null,
          2
        )
      );
      console.log("[PlayerTracker] Created new player ID:", playerId);
      console.log("[PlayerTracker] New installation detected");
    } catch (error) {
      console.error("[PlayerTracker] Error saving player ID:", error.message);
    }

    return playerId;
  }

  markInstallReported() {
    const configPath = path.join(app.getPath("userData"), "player-id.json");

    try {
      const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
      data.installReported = true;
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
      this.installReported = true;
      console.log("[PlayerTracker] Install reported and marked");
    } catch (error) {
      console.error(
        "[PlayerTracker] Error marking install as reported:",
        error.message
      );
    }
  }

  start() {
    if (!this.enabled) {
      console.log("[PlayerTracker] Tracking disabled");
      return;
    }

    console.log("[PlayerTracker] Starting player tracking...");

    // Report unique install if not already reported
    if (!this.installReported) {
      this.reportInstall();
    }

    // Send initial heartbeat
    this.sendHeartbeat();

    // Set up recurring heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  reportInstall() {
    console.log("[PlayerTracker] Reporting unique installation...");

    const data = JSON.stringify({
      playerId: this.playerId,
      version: app.getVersion(),
      timestamp: new Date().toISOString(),
      os: os.platform(),
      osVersion: getOSVersion(), // Actual OS version (Windows 10, Windows 11, etc.)
      platform: process.platform,
      architecture: os.arch(),
    });

    const url = new URL(`${TRACKING_API_URL}/api/install`);
    const httpModule = url.protocol === "https:" ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
      timeout: 10000, // 10 second timeout
    };

    const req = httpModule.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(responseData);
            console.log(
              `[PlayerTracker] Install reported successfully. Total installs: ${response.totalInstalls || "unknown"}`
            );
            this.markInstallReported();
          } catch (e) {
            console.log("[PlayerTracker] Install reported successfully");
            this.markInstallReported();
          }
        } else {
          console.warn(
            `[PlayerTracker] Install report failed with status ${res.statusCode}`
          );
        }
      });
    });

    req.on("error", (error) => {
      console.warn(
        "[PlayerTracker] Install report error:",
        error.message
      );
    });

    req.on("timeout", () => {
      req.destroy();
      console.warn("[PlayerTracker] Install report timeout");
    });

    req.write(data);
    req.end();
  }

  stop() {
    console.log("[PlayerTracker] Stopping player tracking...");

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Send final heartbeat with offline status (optional)
    // this.sendOfflineStatus();
  }

  setStatus(status) {
    if (status !== this.currentStatus) {
      console.log(
        `[PlayerTracker] Status changed: ${this.currentStatus} -> ${status}`
      );
      this.currentStatus = status;

      // Track game session start time
      if (status === "in-game" && !this.gameSessionStart) {
        this.gameSessionStart = Date.now();
      } else if (status !== "in-game" && this.gameSessionStart) {
        // Game session ended
        this.gameSessionStart = null;
      }

      // Send immediate heartbeat on status change
      this.sendHeartbeat();
    }
  }

  sendHeartbeat() {
    const data = JSON.stringify({
      playerId: this.playerId,
      status: this.currentStatus,
      version: app.getVersion(),
      os: os.platform(),
      osVersion: getOSVersion(), // Actual OS version (Windows 10, Windows 11, etc.)
      platform: process.platform,
      gameSessionStart: this.gameSessionStart || null,
      sessionDuration: this.gameSessionStart
        ? Date.now() - this.gameSessionStart
        : 0,
    });

    const url = new URL(`${TRACKING_API_URL}/api/heartbeat`);
    const httpModule = url.protocol === "https:" ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
      timeout: 5000, // 5 second timeout
    };

    const req = httpModule.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(responseData);
            console.log(
              `[PlayerTracker] Heartbeat sent successfully. Total players: ${response.totalPlayers}`
            );
          } catch (e) {
            console.log("[PlayerTracker] Heartbeat sent successfully");
          }
        } else {
          console.warn(
            `[PlayerTracker] Heartbeat failed with status ${res.statusCode}`
          );
        }
      });
    });

    req.on("error", (error) => {
      // Silently fail - don't spam console if server is down
      // console.warn('[PlayerTracker] Heartbeat error:', error.message);
    });

    req.on("timeout", () => {
      req.destroy();
      console.warn("[PlayerTracker] Heartbeat timeout");
    });

    req.write(data);
    req.end();
  }
}

module.exports = new PlayerTracker();
