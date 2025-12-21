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

// Heartbeat endpoint - launcher calls this every 30 seconds
app.post("/api/heartbeat", (req, res) => {
  const {
    playerId,
    status,
    version,
    os,
    platform,
    gameSessionStart,
    sessionDuration,
  } = req.body;

  // Validation
  if (!playerId || typeof playerId !== "string" || playerId.length > 100) {
    return res.status(400).json({ error: "Invalid playerId" });
  }

  if (!status || !["menu", "in-game", "downloading", "installing"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

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
    version: version || "unknown",
    os: os || "unknown",
    platform: platform || "unknown",
    lastSeen: now,
    gameSessionStart: sessionStart || null,
    sessionDuration: sessionDuration || (sessionStart ? now - sessionStart : 0),
    firstSeen: existingPlayer?.firstSeen || now,
  });

  res.json({
    success: true,
    message: "Heartbeat received",
    totalPlayers: activePlayers.size,
  });
});

// Report unique install - launcher calls this once on first launch
app.post("/api/install", async (req, res) => {
  const { playerId, version, timestamp, os, platform, architecture } = req.body;

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

      // Get OS breakdown
      const osBreakdown = await installsCollection
        .aggregate([
          { $group: { _id: "$os", count: { $sum: 1 } } },
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
    downloading: 0,
    installing: 0,
    players: [],
    versionBreakdown: {},
    osBreakdown: {},
  };

  for (const [playerId, data] of activePlayers.entries()) {
    // Count by status
    if (data.status === "in-game") {
      stats.inGame++;
    } else if (data.status === "downloading") {
      stats.downloading++;
    } else if (data.status === "installing") {
      stats.installing++;
    } else {
      stats.inMenu++;
    }

    // Version breakdown
    const version = data.version || "unknown";
    stats.versionBreakdown[version] = (stats.versionBreakdown[version] || 0) + 1;

    // OS breakdown
    const os = data.os || "unknown";
    stats.osBreakdown[os] = (stats.osBreakdown[os] || 0) + 1;

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

// Health check for Railway
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Shadowrun FPS Player Tracking API running on port ${PORT}`);
});
