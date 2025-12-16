// Player tracking heartbeat system
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

// Configuration
const TRACKING_API_URL = "https://playertracker-production.up.railway.app";
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

class PlayerTracker {
  constructor() {
    this.playerId = this.getOrCreatePlayerId();
    this.heartbeatInterval = null;
    this.currentStatus = "menu"; // 'menu' or 'in-game'
    this.enabled = true;
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

      // Send immediate heartbeat on status change
      this.sendHeartbeat();
    }
  }

  sendHeartbeat() {
    const data = JSON.stringify({
      playerId: this.playerId,
      status: this.currentStatus,
      version: app.getVersion(),
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
