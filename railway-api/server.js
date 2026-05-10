// Shadowrun FPS Player Tracking API
// Deploy this to Railway

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const app = express();

app.use(cors());
app.use(express.json({ limit: "10kb" })); // Limit request size

// Rate limiting (simple in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per IP

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const limit = rateLimitMap.get(ip);

  if (now > limit.resetTime) {
    // Reset window
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests" });
  }

  limit.count++;
  next();
}

// Clean up old rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

// Apply rate limiting to all API routes
app.use("/api", rateLimitMiddleware);

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const client = new MongoClient(MONGODB_URI);
let db;
let installsCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    // Use database from connection string (not hardcoded)
    db = client.db();
    installsCollection = db.collection("Installs"); // Capitalized collection name

    // Create index on playerId for faster lookups
    await installsCollection.createIndex({ playerId: 1 }, { unique: true });

    console.log("✅ Connected to MongoDB");
    console.log(`📁 Using collection: Installs`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    console.log("⚠️  Falling back to in-memory storage");
  }
}

// Start MongoDB connection
connectDB();

// In-memory storage for active players (temporary data)
const activePlayers = new Map();
const HEARTBEAT_TIMEOUT = 90000; // 90 seconds (more forgiving for network issues)

// In-memory fallback for installs if MongoDB fails
const uniqueInstalls = new Set();

// Clean up stale players every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [playerId, data] of activePlayers.entries()) {
    if (now - data.lastSeen > HEARTBEAT_TIMEOUT) {
      console.log(`Removing stale player: ${playerId}`);
      activePlayers.delete(playerId);
    }
  }
}, 30000);

function countPlayersWithStatus(status) {
  let n = 0;
  for (const data of activePlayers.values()) {
    if (data.status === status) {
      n++;
    }
  }
  return n;
}

/** Count in-game players whose last heartbeat reported this serverMode (ahl | gfwl | unknown). */
function countInGameByServerMode(mode) {
  let n = 0;
  for (const data of activePlayers.values()) {
    if (data.status !== "in-game") continue;
    const sm = data.serverMode || "unknown";
    if (sm === mode) n++;
  }
  return n;
}

function normalizeServerMode(raw) {
  if (raw === "ahl" || raw === "gfwl" || raw === "unknown") return raw;
  return "unknown";
}

function aggregateInGameSplit() {
  return {
    inGameAhl: countInGameByServerMode("ahl"),
    inGameGfwl: countInGameByServerMode("gfwl"),
    inGameUnknown: countInGameByServerMode("unknown"),
  };
}

// Heartbeat endpoint - launcher calls this every 30 seconds
app.post("/api/heartbeat", (req, res) => {
  const {
    playerId,
    status,
    version,
    os,
    osVersion,
    platform,
    gameSessionStart,
    sessionDuration,
    serverMode: serverModeRaw,
  } = req.body;

  // Validation
  if (!playerId || typeof playerId !== "string" || playerId.length > 100) {
    return res.status(400).json({ error: "Invalid playerId" });
  }

  if (
    !status ||
    !["menu", "in-game", "downloading", "installing"].includes(status)
  ) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const serverMode = normalizeServerMode(serverModeRaw);

  const now = Date.now();
  const existingPlayer = activePlayers.get(playerId);

  // Track session start time if status changed to in-game
  let sessionStart = gameSessionStart;
  if (status === "in-game" && existingPlayer?.status !== "in-game") {
    // New game session started
    sessionStart = now;
  } else if (status === "in-game" && existingPlayer?.gameSessionStart) {
    // Continue existing session
    sessionStart = existingPlayer.gameSessionStart;
  }

  activePlayers.set(playerId, {
    status,
    serverMode,
    version: version || "unknown",
    os: os || "unknown",
    osVersion: osVersion || "unknown",
    platform: platform || "unknown",
    lastSeen: now,
    gameSessionStart: sessionStart || null,
    sessionDuration: sessionDuration || (sessionStart ? now - sessionStart : 0),
    firstSeen: existingPlayer?.firstSeen || now,
  });

  const totalOnline = activePlayers.size;
  const inGame = countPlayersWithStatus("in-game");
  const split = aggregateInGameSplit();

  res.json({
    success: true,
    message: "Heartbeat received",
    totalPlayers: totalOnline,
    totalOnline,
    inGame,
    ...split,
  });
});

// Report unique install - launcher calls this once on first launch
app.post("/api/install", async (req, res) => {
  const {
    playerId,
    version,
    timestamp,
    os,
    osVersion,
    platform,
    architecture,
  } = req.body;

  // Validation
  if (!playerId || typeof playerId !== "string" || playerId.length > 100) {
    return res.status(400).json({ error: "Invalid playerId" });
  }

  try {
    if (installsCollection) {
      // Use MongoDB
      const result = await installsCollection.updateOne(
        { playerId },
        {
          $setOnInsert: {
            playerId,
            version: version || "unknown",
            os: os || "unknown",
            osVersion: osVersion || "unknown",
            platform: platform || "unknown",
            architecture: architecture || "unknown",
            firstInstall: timestamp || new Date().toISOString(),
            createdAt: new Date(),
          },
          $set: {
            lastSeen: new Date(),
            lastVersion: version || "unknown",
          },
        },
        { upsert: true }
      );

      const isNew = result.upsertedCount > 0;
      const totalInstalls = await installsCollection.countDocuments();

      console.log(
        `Install reported: ${playerId.substring(0, 8)}... (${
          isNew ? "NEW" : "EXISTING"
        })`
      );
      console.log(`Total unique installs: ${totalInstalls}`);

      res.json({
        success: true,
        message: isNew ? "New install recorded" : "Install already recorded",
        totalInstalls,
        isNew,
      });
    } else {
      // Fallback to in-memory
      const wasNew = !uniqueInstalls.has(playerId);
      uniqueInstalls.add(playerId);

      console.log(
        `Install reported (in-memory): ${playerId.substring(0, 8)}... (${
          wasNew ? "NEW" : "DUPLICATE"
        })`
      );
      console.log(`Total unique installs: ${uniqueInstalls.size}`);

      res.json({
        success: true,
        message: wasNew ? "New install recorded" : "Install already recorded",
        totalInstalls: uniqueInstalls.size,
        isNew: wasNew,
      });
    }
  } catch (error) {
    console.error("Error recording install:", error);
    res.status(500).json({ error: "Failed to record install" });
  }
});

// Get install statistics - ONLY installs (for website admin panel)
app.get("/api/installs", async (req, res) => {
  try {
    if (installsCollection) {
      // Use MongoDB
      const totalInstalls = await installsCollection.countDocuments();

      // Get version breakdown
      const versionBreakdown = await installsCollection
        .aggregate([
          { $group: { _id: "$version", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();

      // Get OS breakdown (platform identifier)
      const osBreakdown = await installsCollection
        .aggregate([
          { $group: { _id: "$os", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();

      // Get OS Version breakdown (actual OS version)
      const osVersionBreakdown = await installsCollection
        .aggregate([
          { $group: { _id: "$osVersion", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray();

      res.json({
        totalUniqueInstalls: totalInstalls,
        versionBreakdown: versionBreakdown.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        osBreakdown: osBreakdown.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        osVersionBreakdown: osVersionBreakdown.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        timestamp: Date.now(),
      });
    } else {
      // Fallback to in-memory
      res.json({
        totalUniqueInstalls: uniqueInstalls.size,
        versionBreakdown: {},
        osBreakdown: {},
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error("Error fetching install count:", error);
    res.status(500).json({ error: "Failed to fetch install count" });
  }
});

// Get player stats - ONLY online players (for Discord bot)
app.get("/api/stats", (req, res) => {
  const stats = {
    totalOnline: activePlayers.size,
    inMenu: 0,
    inGame: 0,
    inGameAhl: 0,
    inGameGfwl: 0,
    inGameUnknown: 0,
    downloading: 0,
    installing: 0,
    players: [],
    versionBreakdown: {},
    osBreakdown: {},
    osVersionBreakdown: {},
  };

  for (const [playerId, data] of activePlayers.entries()) {
    // Count by status
    if (data.status === "in-game") {
      stats.inGame++;
      const sm = data.serverMode || "unknown";
      if (sm === "ahl") stats.inGameAhl++;
      else if (sm === "gfwl") stats.inGameGfwl++;
      else stats.inGameUnknown++;
    } else if (data.status === "downloading") {
      stats.downloading++;
    } else if (data.status === "installing") {
      stats.installing++;
    } else {
      stats.inMenu++;
    }

    // Version breakdown
    const version = data.version || "unknown";
    stats.versionBreakdown[version] =
      (stats.versionBreakdown[version] || 0) + 1;

    // OS breakdown (platform identifier)
    const os = data.os || "unknown";
    stats.osBreakdown[os] = (stats.osBreakdown[os] || 0) + 1;

    // OS Version breakdown (actual OS version)
    const osVersion = data.osVersion || "unknown";
    stats.osVersionBreakdown[osVersion] =
      (stats.osVersionBreakdown[osVersion] || 0) + 1;

    // Optional: include anonymous player data
    stats.players.push({
      status: data.status,
      version: data.version,
      lastSeen: data.lastSeen,
      sessionDuration: data.sessionDuration || 0,
    });
  }

  res.json(stats);
});

// Simple status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    status: "online",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Transparency endpoint - shows exactly what data is collected
app.get("/api/transparency", (req, res) => {
  // Set content type and pretty-print JSON for readability
  res.setHeader("Content-Type", "application/json");
  res.send(
    JSON.stringify(
      {
        purpose:
          "This endpoint provides full transparency about what data is collected from launcher instances.",
        privacy: {
          noPersonalData: true,
          noIPAddress: false, // IP is logged by Railway for rate limiting only
          noLocation: true,
          noEmail: true,
          noUsername: true,
          anonymousOnly: true,
        },
        dataCollection: {
          install: {
            endpoint: "POST /api/install",
            frequency: "Once per launcher installation (first launch only)",
            purpose: "Track unique installations for statistics",
            data: {
              playerId: {
                type: "string (UUID v4)",
                description:
                  "Anonymous unique identifier generated on first launch",
                example: "550e8400-e29b-41d4-a716-446655440000",
                persistent: true,
                note: "Stored locally in launcher, survives reinstalls",
              },
              version: {
                type: "string",
                description: "Launcher version number",
                example: "0.9.105",
              },
              timestamp: {
                type: "string (ISO 8601)",
                description: "When the install was first reported",
                example: "2024-01-16T00:00:00.000Z",
              },
              os: {
                type: "string",
                description:
                  "Operating system platform identifier (Node.js os.platform())",
                example: "win32",
                possibleValues: ["win32", "darwin", "linux"],
                note: "'win32' is the platform identifier for ALL Windows versions (Windows 10, 11, etc.). This is not the specific OS version, just the platform family.",
              },
              osVersion: {
                type: "string",
                description:
                  "Actual operating system version (e.g., 'Windows 10', 'Windows 11', 'macOS Monterey')",
                example: "Windows 11",
                note: "Detected by parsing OS release version. For Windows: Windows 11 (build 22000+), Windows 10 (build < 22000), Windows 7/8/8.1, etc.",
              },
              platform: {
                type: "string",
                description:
                  "Process platform (Node.js process.platform, usually same as os)",
                example: "win32",
                note: "Same as 'os' field - platform identifier, not OS version",
              },
              architecture: {
                type: "string",
                description: "CPU architecture",
                example: "x64",
                possibleValues: ["x64", "ia32", "arm64"],
              },
            },
            examplePayload: {
              playerId: "550e8400-e29b-41d4-a716-446655440000",
              version: "0.9.105",
              timestamp: "2024-01-16T00:00:00.000Z",
              os: "win32",
              osVersion: "Windows 11",
              platform: "win32",
              architecture: "x64",
            },
            storedIn: "MongoDB collection 'Installs' (persistent)",
          },
          heartbeat: {
            endpoint: "POST /api/heartbeat",
            frequency: "Every 30 seconds while launcher is running",
            purpose: "Track active players and game sessions",
            data: {
              playerId: {
                type: "string (UUID v4)",
                description: "Same anonymous identifier from install",
                example: "550e8400-e29b-41d4-a716-446655440000",
              },
              status: {
                type: "string",
                description: "Current launcher/game state",
                example: "in-game",
                possibleValues: [
                  "menu",
                  "in-game",
                  "downloading",
                  "installing",
                ],
              },
              version: {
                type: "string",
                description: "Launcher version number",
                example: "0.9.105",
              },
              os: {
                type: "string",
                description:
                  "Operating system platform identifier (Node.js os.platform())",
                example: "win32",
                note: "'win32' is the platform identifier for ALL Windows versions (Windows 10, 11, etc.)",
              },
              osVersion: {
                type: "string",
                description:
                  "Actual operating system version (e.g., 'Windows 10', 'Windows 11', 'macOS Monterey')",
                example: "Windows 11",
                note: "Detected by parsing OS release version. Shows the specific OS version, not just the platform family.",
              },
              platform: {
                type: "string",
                description: "Process platform (Node.js process.platform)",
                example: "win32",
                note: "Same as 'os' field - platform identifier, not OS version",
              },
              gameSessionStart: {
                type: "number (timestamp) or null",
                description:
                  "When current game session started (only when status is 'in-game')",
                example: 1705392000000,
                note: "null when not in-game",
              },
              sessionDuration: {
                type: "number (milliseconds)",
                description: "How long current game session has been active",
                example: 3600000,
                note: "0 when not in-game",
              },
              serverMode: {
                type: "string",
                description:
                  "Configured server endpoints from game folder patcher_conf.ini (launcher-reported; optional on older clients)",
                example: "ahl",
                possibleValues: ["ahl", "gfwl", "unknown"],
              },
            },
            examplePayload: {
              playerId: "550e8400-e29b-41d4-a716-446655440000",
              status: "in-game",
              version: "0.9.105",
              os: "win32",
              osVersion: "Windows 11",
              platform: "win32",
              gameSessionStart: 1705392000000,
              sessionDuration: 3600000,
              serverMode: "ahl",
            },
            storedIn:
              "In-memory Map (temporary, cleared after 90 seconds of inactivity)",
          },
        },
        whatWeDontCollect: [
          "Personal information (name, email, username)",
          "IP addresses (only used for rate limiting, not stored)",
          "Location data",
          "Hardware identifiers (MAC address, serial numbers)",
          "File system paths",
          "Game settings or preferences",
          "Discord user IDs or tokens",
          "Any data that could identify you personally",
        ],
        dataRetention: {
          installs: "Permanently stored in MongoDB (for statistics)",
          heartbeats: "Temporary - cleared after 90 seconds of inactivity",
        },
        dataUsage: {
          statistics: "Total unique installs, version breakdown, OS breakdown",
          realTimeStats:
            "Current online players, players in-game, players in menu",
          discordIntegration:
            "Display player count in Discord bot (no personal data)",
        },
        rateLimiting: {
          enabled: true,
          window: "1 minute",
          maxRequests: "30 requests per IP per minute",
          purpose: "Prevent abuse and protect server resources",
        },
        sourceCode: {
          launcher: "https://github.com/3MERGx/shadowrun-launcher",
          server: "Available in railway-api/server.js",
          note: "All code is open source for transparency",
        },
        lastUpdated: "2024-01-16",
        version: "1.0.0",
      },
      null,
      2
    )
  );
});

// Health check for Railway
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Shadowrun FPS Player Tracking API running on port ${PORT}`);
});
